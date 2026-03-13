/**
 * Shared constants for ChatGPT vs Gemini performance comparison race.
 * 
 * This file contains constants used by both test files to ensure consistency
 * and make updates easier.
 */

// Race measurement name - used by raceStart() and raceEnd()
export const RACE_NAME = 'First response token';

// Test prompt - the query sent to both AI platforms
export const TEST_PROMPT = 'What is the meaning of life?';
