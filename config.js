// ============================================================
// STATMASK — DAILY CONFIG
// Update this file each day with the player + clues
// ============================================================

const STATMASK_CONFIG = {

  mlb: {
    answer: "Nolan Arenado",
    clues: [
      { label: "Season", value: "2025" },
      { label: "Batting Average", value: ".237" },
      { label: "Position / Throws", value: "3B / Right" },
      { label: "League", value: "National League" },
      { label: "Team", value: "St. Louis Cardinals" }
    ],
    players: MLB_PLAYERS
  },

  nba: {
    answer: "Karl-Anthony Towns",
    clues: [
      { label: "Season", value: "2024-2025" },
      { label: "Draft Year / Position", value: "2015 / PF/C" },
      { label: "Season PPG", value: "24.4" },
      { label: "College", value: "Kentucky" },
      { label: "Team", value: "New York Knicks" }
    ],
    players: NBA_PLAYERS
  },

  nfl: {
    answer: "Tee Higgins",
    clues: [
      { label: "Season", value: "2025" },
      { label: "Draft Year / Position", value: "2020 / WR" },
      { label: "Receiving Yards", value: "846" },
      { label: "Conference", value: "AFC" },
      { label: "Team", value: "Cincinnati Bengals" }
    ],
    players: NFL_PLAYERS
  }

};
