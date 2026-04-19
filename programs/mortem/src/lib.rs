//! Mortem stores user registries, agent registries, and Merkle batch commitments on Solana.
//! Instructions are added incrementally so each account and authorization path can be tested.
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod mortem {
    use super::*;
}
