#!/usr/bin/env python3
"""
StatMask Schedule Generator
Automatically generates daily puzzle clues using Claude AI with web search for fact verification.

Usage:
  ANTHROPIC_API_KEY=... python generate_schedule.py [days]

  days: number of days to generate ahead (default: 7)
"""

import json
import random
import os
import sys
import re
import time
from datetime import date, timedelta

import anthropic

# ── Paths ──────────────────────────────────────────────────────────────────
SCHEDULE_FILE = os.path.join(os.path.dirname(__file__), 'schedule.json')
FEATURED_FILE = os.path.join(os.path.dirname(__file__), 'featured_players.json')

# ── System prompt ──────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are a sports trivia expert generating clues for StatMask — a daily sports guessing game where players guess a mystery athlete from 5 progressive clues.

ABSOLUTE RULES — never break these:
1. Never mention the player's last name in clues 1–4
2. Never mention the player's current team in clues 1–4
3. Every stat and fact must be 100% accurate — use web search to verify before including
4. The teammate referenced in clue 4 must no longer play for the player's current team
5. Clues progress from obscure (clue 1) to obvious (clue 5)
6. Keep each clue to 1–2 sentences

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MLB CLUE ORDER:
1. Specific statistical fact from their 2025 MLB season (games, HR, RBI, ERA, strikeouts, SB, etc.)
2. "Nationality: [Country]; [Interesting personal fun fact about the player]"
3. A remarkable feat, record, or historic achievement from their professional career
4. A former teammate who no longer plays for their current team — describe something they accomplished together
5. "He/She plays [Position] for the [Team Name]"

NFL CLUE ORDER:
1. Specific statistical fact from their 2025 NFL season (yards, TDs, receptions, sacks, INTs, etc.)
2. A remarkable feat, record, or historic achievement from their professional career
3. "College: [School]; Draft Year: [Year]"
4. A former teammate who no longer plays for their current team — describe something they accomplished together
5. "He plays [Position] for the [Team Name]"

NBA CLUE ORDER:
1. Specific statistical fact from their 2024–25 NBA season (PPG, RPG, APG, FG%, etc.)
2. A remarkable feat, record, or historic achievement from their professional career
3. "College: [School]; Draft Year: [Year]" — use "N/A (International)" for players who did not attend a US college
4. A former teammate who no longer plays for their current team — describe something they accomplished together
5. "He/She plays [Position] for the [Team Name]"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON — no markdown fences, no extra text:
{
  "answer": "Full Player Name",
  "accolades": ["Specific Award 1", "Specific Award 2"],
  "clues": ["clue 1", "clue 2", "clue 3", "clue 4", "clue 5"]
}

Accolades: 1–3 real, specific awards only (MVP, All-Star, Gold Glove, Pro Bowl, Cy Young, etc.).
Do not use generic labels like "12-Year Veteran", draft round alone, or editorial phrases like "breakout star"."""


# ── Helpers ────────────────────────────────────────────────────────────────

def load_json(path: str) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_json(path: str, data: dict) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


def used_players(schedule: dict) -> dict:
    """Collect all player names already used across the schedule."""
    used = {'mlb': set(), 'nba': set(), 'nfl': set()}
    for day in schedule.values():
        for sport in used:
            if sport in day and 'answer' in day[sport]:
                used[sport].add(day[sport]['answer'].lower())
    return used


def last_scheduled_date(schedule: dict) -> date:
    if not schedule:
        return date.today() - timedelta(days=1)
    return date.fromisoformat(max(schedule.keys()))


def pick_player(pool: list, used: set) -> str:
    available = [p for p in pool if p.lower() not in used]
    if not available:
        raise RuntimeError("All featured players for this sport have been used!")
    return random.choice(available)


def extract_json(text: str) -> dict:
    """Parse JSON from model response, stripping any accidental markdown fences."""
    text = text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    return json.loads(text.strip())


def generate_entry(client: anthropic.Anthropic, player: str, sport: str) -> dict:
    """Call Claude with web search to generate and verify puzzle clues for a player."""
    sport_label = sport.upper()
    user_msg = (
        f"Generate StatMask puzzle clues for this {sport_label} player: **{player}**\n\n"
        f"Use web search to verify all statistics and facts for accuracy before writing each clue. "
        f"Double-check the 2025 season stats and any historical records you include."
    )
    messages = [{"role": "user", "content": user_msg}]

    # Loop to handle pause_turn (server-side tool search iteration limit)
    while True:
        with client.messages.stream(
            model="claude-opus-4-6",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            tools=[{"type": "web_search_20260209", "name": "web_search"}],
            messages=messages,
        ) as stream:
            response = stream.get_final_message()

        if response.stop_reason in ("end_turn", "stop_sequence"):
            break
        elif response.stop_reason == "pause_turn":
            # Server hit its internal search iteration limit — continue from where it left off
            messages = [
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": response.content},
                {"role": "user", "content": "Continue."},
            ]
        else:
            break

    # Try to extract JSON from the response
    for block in response.content:
        if block.type == "text" and block.text.strip():
            return extract_json(block.text)

    # No JSON text found — the model likely finished searching but didn't output JSON.
    # Send a follow-up turn asking it to produce the final answer.
    messages = [
        {"role": "user", "content": user_msg},
        {"role": "assistant", "content": response.content},
        {"role": "user", "content": "Now output the JSON with the clues based on your research."},
    ]

    with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        tools=[{"type": "web_search_20260209", "name": "web_search"}],
        messages=messages,
    ) as stream:
        followup = stream.get_final_message()

    for block in followup.content:
        if block.type == "text" and block.text.strip():
            return extract_json(block.text)

    raise ValueError(f"No JSON text block returned for {player}")


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> None:
    days = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('DAYS_TO_GENERATE', '7'))

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    schedule = load_json(SCHEDULE_FILE)
    featured = load_json(FEATURED_FILE)
    used = used_players(schedule)
    start = last_scheduled_date(schedule) + timedelta(days=1)

    client = anthropic.Anthropic(api_key=api_key)

    print(f"Generating {days} days starting from {start.isoformat()}\n")

    for i in range(days):
        day = start + timedelta(days=i)
        date_key = day.isoformat()
        print(f"── {date_key} ──────────────────────────────")
        schedule[date_key] = {}

        for sport in ['mlb', 'nba', 'nfl']:
            player = pick_player(featured[sport], used[sport])
            print(f"  {sport.upper()}: {player} ... ", end='', flush=True)

            max_retries = 5
            for attempt in range(max_retries):
                try:
                    entry = generate_entry(client, player, sport)
                    schedule[date_key][sport] = entry
                    used[sport].add(player.lower())
                    print("✓")
                    break
                except anthropic.RateLimitError as e:
                    wait = 60 * (attempt + 1)
                    print(f"rate limited, retrying in {wait}s ... ", end='', flush=True)
                    time.sleep(wait)
                except Exception as e:
                    print(f"✗  FAILED: {e}", file=sys.stderr)
                    # Remove the incomplete day and save what we have before exiting
                    del schedule[date_key]
                    save_json(SCHEDULE_FILE, dict(sorted(schedule.items())))
                    sys.exit(1)
            else:
                print(f"✗  FAILED: rate limit exceeded after {max_retries} retries", file=sys.stderr)
                del schedule[date_key]
                save_json(SCHEDULE_FILE, dict(sorted(schedule.items())))
                sys.exit(1)

        print()

    schedule = dict(sorted(schedule.items()))
    save_json(SCHEDULE_FILE, schedule)
    print(f"Done — {days} days added to schedule.json")


if __name__ == '__main__':
    main()
