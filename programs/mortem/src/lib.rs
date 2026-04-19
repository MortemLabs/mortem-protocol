//! Mortem stores user registries, agent registries, and Merkle batch commitments on Solana.
//! Instructions are added incrementally so each account and authorization path can be tested.
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{hash::hash, program::invoke_signed, system_instruction};

declare_id!("9HooSdYAu1uDNwuoDhjcQr8KH67TwSXe4XJEviuKofMn");

pub const AGENT_REGISTRY_SEED: &[u8] = b"agent";
pub const BATCH_SEED: &[u8] = b"batch";
pub const USER_REGISTRY_SEED: &[u8] = b"user";
pub const ADMIN_AUTHORITY: Pubkey = pubkey!("9C6hybhQ6Aycep9jaUnP6uL9ZYvDjUp1aSkFWPUFJtpj");
pub const FREE_PLAN: u8 = 0;
pub const PRO_PLAN: u8 = 1;
pub const TEAM_PLAN: u8 = 2;
pub const MINIMUM_RESERVE: u64 = 5_000_000;

#[program]
pub mod mortem {
    use super::*;

    pub fn register_user(ctx: Context<RegisterUser>, display_name: [u8; 32]) -> Result<()> {
        let timestamp = Clock::get()?.unix_timestamp;
        let user_registry = &mut ctx.accounts.user_registry;

        user_registry.owner = ctx.accounts.owner.key();
        user_registry.display_name = display_name;
        user_registry.created_at = timestamp;
        user_registry.agent_count = 0;
        user_registry.batch_count = 0;
        user_registry.plan = FREE_PLAN;
        user_registry.bump = ctx.bumps.user_registry;

        emit!(RegisterUserEvent {
            owner: ctx.accounts.owner.key(),
            pda: user_registry.key(),
            timestamp,
        });

        Ok(())
    }

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        display_name: [u8; 32],
        agent_wallet: Pubkey,
    ) -> Result<()> {
        let timestamp = Clock::get()?.unix_timestamp;
        let user_registry = &mut ctx.accounts.user_registry;
        let user_registry_key = user_registry.key();
        let display_name_hash = hash(&display_name).to_bytes();
        let (agent_pda, agent_bump) = Pubkey::find_program_address(
            &[
                AGENT_REGISTRY_SEED,
                user_registry_key.as_ref(),
                display_name_hash.as_ref(),
            ],
            ctx.program_id,
        );

        require_keys_eq!(
            agent_pda,
            ctx.accounts.agent_registry.key(),
            MortemError::Unauthorized
        );

        let rent_lamports = Rent::get()?.minimum_balance(8 + AgentRegistry::LEN);
        let create_agent = system_instruction::create_account(
            &ctx.accounts.owner.key(),
            &agent_pda,
            rent_lamports,
            (8 + AgentRegistry::LEN) as u64,
            ctx.program_id,
        );
        let bump = [agent_bump];
        let signer_seeds: &[&[u8]] = &[
            AGENT_REGISTRY_SEED,
            user_registry_key.as_ref(),
            display_name_hash.as_ref(),
            &bump,
        ];

        invoke_signed(
            &create_agent,
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.agent_registry.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[signer_seeds],
        )?;

        let agent_registry = AgentRegistry {
            user_registry: user_registry_key,
            owner: ctx.accounts.owner.key(),
            agent_wallet,
            display_name,
            created_at: timestamp,
            batch_count: 0,
            bump: agent_bump,
        };
        agent_registry.try_serialize(&mut &mut ctx.accounts.agent_registry.data.borrow_mut()[..])?;
        user_registry.agent_count = user_registry.agent_count.saturating_add(1);

        emit!(RegisterAgentEvent {
            owner: ctx.accounts.owner.key(),
            agent_pda,
            user_pda: user_registry_key,
            timestamp,
        });

        Ok(())
    }

    pub fn commit_batch(
        ctx: Context<CommitBatch>,
        merkle_root: [u8; 32],
        trace_count: u32,
    ) -> Result<()> {
        let batch_index = ctx.accounts.agent_registry.batch_count;
        let batch_index_bytes = batch_index.to_le_bytes();
        let agent_key = ctx.accounts.agent_registry.key();
        let (batch_pda, batch_bump) = Pubkey::find_program_address(
            &[BATCH_SEED, agent_key.as_ref(), batch_index_bytes.as_ref()],
            ctx.program_id,
        );

        require_keys_eq!(
            batch_pda,
            ctx.accounts.anchor_batch.key(),
            MortemError::Unauthorized
        );

        let batch_rent = Rent::get()?.minimum_balance(8 + AnchorBatch::LEN);
        let user_registry_info = ctx.accounts.user_registry.to_account_info();
        let anchor_batch_info = ctx.accounts.anchor_batch.to_account_info();
        let user_registry_balance = user_registry_info.lamports();

        require!(
            user_registry_balance >= batch_rent.saturating_add(MINIMUM_RESERVE),
            MortemError::FundingRequired
        );

        **user_registry_info.try_borrow_mut_lamports()? = user_registry_balance - batch_rent;
        **anchor_batch_info.try_borrow_mut_lamports()? =
            anchor_batch_info.lamports().saturating_add(batch_rent);

        let batch_bump_seed = [batch_bump];
        let batch_signer_seeds: &[&[u8]] = &[
            BATCH_SEED,
            agent_key.as_ref(),
            batch_index_bytes.as_ref(),
            &batch_bump_seed,
        ];

        invoke_signed(
            &system_instruction::allocate(&batch_pda, (8 + AnchorBatch::LEN) as u64),
            &[
                anchor_batch_info.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[batch_signer_seeds],
        )?;
        invoke_signed(
            &system_instruction::assign(&batch_pda, ctx.program_id),
            &[
                anchor_batch_info.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[batch_signer_seeds],
        )?;

        let timestamp = Clock::get()?.unix_timestamp;
        let user_registry_key = ctx.accounts.user_registry.key();
        let anchor_batch = AnchorBatch {
            user_registry: user_registry_key,
            agent: agent_key,
            batch_index,
            merkle_root,
            trace_count,
            committed_at: timestamp,
            committer: ctx.accounts.committer.key(),
            bump: batch_bump,
        };
        anchor_batch.try_serialize(&mut &mut ctx.accounts.anchor_batch.data.borrow_mut()[..])?;

        ctx.accounts.agent_registry.batch_count =
            ctx.accounts.agent_registry.batch_count.saturating_add(1);
        ctx.accounts.user_registry.batch_count =
            ctx.accounts.user_registry.batch_count.saturating_add(1);

        emit!(CommitBatchEvent {
            user_registry: user_registry_key,
            agent: agent_key,
            batch_index,
            merkle_root,
            trace_count,
            committed_at: timestamp,
        });

        Ok(())
    }

    pub fn upgrade_plan(ctx: Context<UpgradePlan>, new_plan: u8) -> Result<()> {
        require_admin(&ctx.accounts.admin)?;
        require!(new_plan <= TEAM_PLAN, MortemError::InvalidPlan);

        ctx.accounts.user_registry.plan = new_plan;

        Ok(())
    }

    pub fn close_agent(ctx: Context<CloseAgent>) -> Result<()> {
        require_admin(&ctx.accounts.admin)?;

        ctx.accounts.user_registry.agent_count =
            ctx.accounts.user_registry.agent_count.saturating_sub(1);

        Ok(())
    }

    pub fn close_user(ctx: Context<CloseUser>) -> Result<()> {
        require_admin(&ctx.accounts.admin)?;

        Ok(())
    }
}

fn require_admin(admin: &Signer<'_>) -> Result<()> {
    require_keys_eq!(admin.key(), ADMIN_AUTHORITY, MortemError::Unauthorized);
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + UserRegistry::LEN,
        seeds = [USER_REGISTRY_SEED, owner.key().as_ref()],
        bump
    )]
    pub user_registry: Account<'info, UserRegistry>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(display_name: [u8; 32], agent_wallet: Pubkey)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [USER_REGISTRY_SEED, owner.key().as_ref()],
        bump = user_registry.bump,
        has_one = owner
    )]
    pub user_registry: Account<'info, UserRegistry>,
    /// CHECK: The instruction creates and verifies this PDA before writing AgentRegistry data.
    #[account(mut)]
    pub agent_registry: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitBatch<'info> {
    #[account(mut)]
    pub committer: Signer<'info>,
    #[account(
        mut,
        seeds = [USER_REGISTRY_SEED, user_registry.owner.as_ref()],
        bump = user_registry.bump
    )]
    pub user_registry: Account<'info, UserRegistry>,
    #[account(
        mut,
        has_one = user_registry
    )]
    pub agent_registry: Account<'info, AgentRegistry>,
    /// CHECK: The instruction verifies this PDA, funds it from UserRegistry, and writes AnchorBatch data.
    #[account(mut)]
    pub anchor_batch: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpgradePlan<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [USER_REGISTRY_SEED, user_registry.owner.as_ref()],
        bump = user_registry.bump
    )]
    pub user_registry: Account<'info, UserRegistry>,
}

#[derive(Accounts)]
pub struct CloseAgent<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [USER_REGISTRY_SEED, user_registry.owner.as_ref()],
        bump = user_registry.bump
    )]
    pub user_registry: Account<'info, UserRegistry>,
    #[account(
        mut,
        close = owner_wallet,
        has_one = user_registry
    )]
    pub agent_registry: Account<'info, AgentRegistry>,
    #[account(mut, address = user_registry.owner)]
    pub owner_wallet: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseUser<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        close = owner_wallet,
        seeds = [USER_REGISTRY_SEED, user_registry.owner.as_ref()],
        bump = user_registry.bump
    )]
    pub user_registry: Account<'info, UserRegistry>,
    #[account(mut, address = user_registry.owner)]
    pub owner_wallet: SystemAccount<'info>,
}

#[account]
pub struct UserRegistry {
    pub owner: Pubkey,
    pub display_name: [u8; 32],
    pub created_at: i64,
    pub agent_count: u64,
    pub batch_count: u64,
    pub plan: u8,
    pub bump: u8,
}

impl UserRegistry {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct AgentRegistry {
    pub user_registry: Pubkey,
    pub owner: Pubkey,
    pub agent_wallet: Pubkey,
    pub display_name: [u8; 32],
    pub created_at: i64,
    pub batch_count: u64,
    pub bump: u8,
}

impl AgentRegistry {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 8 + 8 + 1;
}

#[account]
pub struct AnchorBatch {
    pub user_registry: Pubkey,
    pub agent: Pubkey,
    pub batch_index: u64,
    pub merkle_root: [u8; 32],
    pub trace_count: u32,
    pub committed_at: i64,
    pub committer: Pubkey,
    pub bump: u8,
}

impl AnchorBatch {
    pub const LEN: usize = 32 + 32 + 8 + 32 + 4 + 8 + 32 + 1;
}

#[event]
pub struct RegisterUserEvent {
    pub owner: Pubkey,
    pub pda: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RegisterAgentEvent {
    pub owner: Pubkey,
    pub agent_pda: Pubkey,
    pub user_pda: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct CommitBatchEvent {
    pub user_registry: Pubkey,
    pub agent: Pubkey,
    pub batch_index: u64,
    pub merkle_root: [u8; 32],
    pub trace_count: u32,
    pub committed_at: i64,
}

#[error_code]
pub enum MortemError {
    #[msg("UserRegistry PDA has insufficient balance")]
    FundingRequired,
    #[msg("Wrong signer for privileged instruction")]
    Unauthorized,
    #[msg("Unknown plan value")]
    InvalidPlan,
}
