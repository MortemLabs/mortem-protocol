//! Mortem stores user registries, agent registries, and Merkle batch commitments on Solana.
//! Instructions are added incrementally so each account and authorization path can be tested.
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

declare_id!("11111111111111111111111111111111");

pub const AGENT_REGISTRY_SEED: &[u8] = b"agent";
pub const USER_REGISTRY_SEED: &[u8] = b"user";
pub const FREE_PLAN: u8 = 0;

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
