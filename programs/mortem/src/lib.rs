//! Mortem stores user registries, agent registries, and Merkle batch commitments on Solana.
//! Instructions are added incrementally so each account and authorization path can be tested.
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

declare_id!("11111111111111111111111111111111");

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
        let agent_registry = &mut ctx.accounts.agent_registry;

        agent_registry.user_registry = user_registry.key();
        agent_registry.owner = ctx.accounts.owner.key();
        agent_registry.agent_wallet = agent_wallet;
        agent_registry.display_name = display_name;
        agent_registry.created_at = timestamp;
        agent_registry.batch_count = 0;
        agent_registry.bump = ctx.bumps.agent_registry;
        user_registry.agent_count = user_registry.agent_count.saturating_add(1);

        emit!(RegisterAgentEvent {
            owner: ctx.accounts.owner.key(),
            agent_pda: agent_registry.key(),
            user_pda: user_registry.key(),
            timestamp,
        });

        Ok(())
    }

    pub fn commit_batch(
        ctx: Context<CommitBatch>,
        merkle_root: [u8; 32],
        trace_count: u32,
    ) -> Result<()> {
        let batch_rent = Rent::get()?.minimum_balance(8 + AnchorBatch::LEN);
        let user_registry_balance = ctx.accounts.user_registry.to_account_info().lamports();

        require!(
            user_registry_balance >= batch_rent.saturating_add(MINIMUM_RESERVE),
            MortemError::FundingRequired
        );

        let timestamp = Clock::get()?.unix_timestamp;
        let batch_index = ctx.accounts.agent_registry.batch_count;
        let user_registry_key = ctx.accounts.user_registry.key();
        let agent_key = ctx.accounts.agent_registry.key();
        let anchor_batch = &mut ctx.accounts.anchor_batch;

        anchor_batch.user_registry = user_registry_key;
        anchor_batch.agent = agent_key;
        anchor_batch.batch_index = batch_index;
        anchor_batch.merkle_root = merkle_root;
        anchor_batch.trace_count = trace_count;
        anchor_batch.committed_at = timestamp;
        anchor_batch.committer = ctx.accounts.committer.key();
        anchor_batch.bump = ctx.bumps.anchor_batch;

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
#[instruction(display_name: [u8; 32])]
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
    #[account(
        init,
        payer = owner,
        space = 8 + AgentRegistry::LEN,
        seeds = [
            AGENT_REGISTRY_SEED,
            user_registry.key().as_ref(),
            hash(&display_name).as_ref()
        ],
        bump
    )]
    pub agent_registry: Account<'info, AgentRegistry>,
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
        seeds = [
            AGENT_REGISTRY_SEED,
            user_registry.key().as_ref(),
            hash(&agent_registry.display_name).as_ref()
        ],
        bump = agent_registry.bump,
        has_one = user_registry
    )]
    pub agent_registry: Account<'info, AgentRegistry>,
    #[account(
        init,
        payer = user_registry,
        space = 8 + AnchorBatch::LEN,
        seeds = [
            BATCH_SEED,
            agent_registry.key().as_ref(),
            &agent_registry.batch_count.to_le_bytes()
        ],
        bump
    )]
    pub anchor_batch: Account<'info, AnchorBatch>,
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
