/**
 * Mini-modes registry — import this once to register all modes.
 * @module IDENTITY
 */

export * from './engine.js'

// Register all modes (side-effect imports)
import './search-memory.mode.js'
import './search-project.mode.js'
import './check-budget.mode.js'
import './check-fleet.mode.js'
import './save-idea.mode.js'
