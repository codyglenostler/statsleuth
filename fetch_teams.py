"""
fetch_teams.py
Fetches current team for each active player in the JS player files,
then rewrites the entries from "Name" to "Name|Team Name".

Sources:
  NBA - basketball-reference.com (pandas.read_html)
  NFL - nfl_data_py
  MLB - pybaseball
"""

import pandas as pd
import re
import unicodedata
import os

BASE = os.path.dirname(os.path.abspath(__file__))

# ── Team abbreviation → full name maps ────────────────────────────────────────

NBA_TEAMS = {
    'ATL': 'Atlanta Hawks',         'BOS': 'Boston Celtics',
    'BRK': 'Brooklyn Nets',         'CHO': 'Charlotte Hornets',
    'CHI': 'Chicago Bulls',         'CLE': 'Cleveland Cavaliers',
    'DAL': 'Dallas Mavericks',      'DEN': 'Denver Nuggets',
    'DET': 'Detroit Pistons',       'GSW': 'Golden State Warriors',
    'HOU': 'Houston Rockets',       'IND': 'Indiana Pacers',
    'LAC': 'LA Clippers',           'LAL': 'Los Angeles Lakers',
    'MEM': 'Memphis Grizzlies',     'MIA': 'Miami Heat',
    'MIL': 'Milwaukee Bucks',       'MIN': 'Minnesota Timberwolves',
    'NOP': 'New Orleans Pelicans',  'NYK': 'New York Knicks',
    'OKC': 'Oklahoma City Thunder', 'ORL': 'Orlando Magic',
    'PHI': 'Philadelphia 76ers',    'PHO': 'Phoenix Suns',
    'POR': 'Portland Trail Blazers','SAC': 'Sacramento Kings',
    'SAS': 'San Antonio Spurs',     'TOR': 'Toronto Raptors',
    'UTA': 'Utah Jazz',             'WAS': 'Washington Wizards',
}

NFL_FRANCHISES = {
    'ARI': 'Arizona Cardinals',    'ATL': 'Atlanta Falcons',
    'BAL': 'Baltimore Ravens',     'BUF': 'Buffalo Bills',
    'CAR': 'Carolina Panthers',    'CHI': 'Chicago Bears',
    'CIN': 'Cincinnati Bengals',   'CLE': 'Cleveland Browns',
    'DAL': 'Dallas Cowboys',       'DEN': 'Denver Broncos',
    'DET': 'Detroit Lions',        'GB':  'Green Bay Packers',
    'GNB': 'Green Bay Packers',    'HOU': 'Houston Texans',
    'IND': 'Indianapolis Colts',   'JAX': 'Jacksonville Jaguars',
    'JAC': 'Jacksonville Jaguars', 'KC':  'Kansas City Chiefs',
    'KAN': 'Kansas City Chiefs',   'LV':  'Las Vegas Raiders',
    'LVR': 'Las Vegas Raiders',    'LAC': 'Los Angeles Chargers',
    'LAR': 'Los Angeles Rams',     'MIA': 'Miami Dolphins',
    'MIN': 'Minnesota Vikings',    'NE':  'New England Patriots',
    'NWE': 'New England Patriots', 'NO':  'New Orleans Saints',
    'NOR': 'New Orleans Saints',   'NYG': 'New York Giants',
    'NYJ': 'New York Jets',        'PHI': 'Philadelphia Eagles',
    'PIT': 'Pittsburgh Steelers',  'SF':  'San Francisco 49ers',
    'SFO': 'San Francisco 49ers',  'SEA': 'Seattle Seahawks',
    'TB':  'Tampa Bay Buccaneers', 'TAM': 'Tampa Bay Buccaneers',
    'TEN': 'Tennessee Titans',     'WAS': 'Washington Commanders',
}

MLB_FRANCHISES = {
    'ARI': 'Arizona Diamondbacks', 'ATL': 'Atlanta Braves',
    'BAL': 'Baltimore Orioles',    'BOS': 'Boston Red Sox',
    'CHC': 'Chicago Cubs',         'CWS': 'Chicago White Sox',
    'CHW': 'Chicago White Sox',    'CIN': 'Cincinnati Reds',
    'CLE': 'Cleveland Guardians',  'COL': 'Colorado Rockies',
    'DET': 'Detroit Tigers',       'HOU': 'Houston Astros',
    'KCR': 'Kansas City Royals',   'KCA': 'Kansas City Royals',
    'LAA': 'Los Angeles Angels',   'LAD': 'Los Angeles Dodgers',
    'MIA': 'Miami Marlins',        'FLA': 'Miami Marlins',
    'MIL': 'Milwaukee Brewers',    'MIN': 'Minnesota Twins',
    'NYM': 'New York Mets',        'NYY': 'New York Yankees',
    'OAK': 'Oakland Athletics',    'ATH': 'Oakland Athletics',
    'PHI': 'Philadelphia Phillies','PIT': 'Pittsburgh Pirates',
    'SDP': 'San Diego Padres',     'SDN': 'San Diego Padres',
    'SFG': 'San Francisco Giants', 'SFN': 'San Francisco Giants',
    'SEA': 'Seattle Mariners',     'STL': 'St. Louis Cardinals',
    'SLN': 'St. Louis Cardinals',  'TBR': 'Tampa Bay Rays',
    'TBA': 'Tampa Bay Rays',       'TEX': 'Texas Rangers',
    'TOR': 'Toronto Blue Jays',    'WSN': 'Washington Nationals',
    'WAS': 'Washington Nationals', 'MON': 'Washington Nationals',
    'LAN': 'Los Angeles Dodgers',  'NYA': 'New York Yankees',
    'NYN': 'New York Mets',        'ANA': 'Los Angeles Angels',
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def norm(name):
    """Normalize name for fuzzy matching."""
    n = unicodedata.normalize('NFD', str(name))
    n = ''.join(c for c in n if unicodedata.category(c) != 'Mn')
    n = n.lower().replace('.', '').replace("'", '').replace('-', ' ')
    n = re.sub(r'\s+(jr|sr|ii|iii|iv)\.?$', '', n.strip())
    n = re.sub(r'\s+', ' ', n)  # collapse multiple spaces (from "A. J." → "a  j")
    return n.strip()

# ── NBA ───────────────────────────────────────────────────────────────────────

def fetch_nba_teams():
    print("\nFetching NBA 2024-25 teams (basketball-reference)...")
    url = "https://www.basketball-reference.com/leagues/NBA_2025_totals.html"
    try:
        tables = pd.read_html(url, flavor='lxml')
        df = tables[0]
    except Exception as e:
        print(f"  Failed: {e}")
        return {}

    df = df[df['Player'] != 'Player'].copy()

    # Multi-team rows use "2TM", "3TM" etc — skip those, keep individual team rows
    # For each player, the last team listed = their final team that season
    result = {}
    for _, row in df.iterrows():
        team_val = str(row.get('Team', '')).strip()
        if re.match(r'^\d+TM$', team_val):  # skip "2TM", "3TM" etc.
            continue
        name = str(row['Player']).strip()
        team_full = NBA_TEAMS.get(team_val, team_val)
        result[norm(name)] = (name, team_full)

    print(f"  Got {len(result)} NBA players.")
    return result

# ── NFL ───────────────────────────────────────────────────────────────────────

def fetch_nfl_teams():
    print("\nFetching NFL 2025 rosters (nfl_data_py)...")
    import nfl_data_py as nfl
    result = {}
    for year in [2025, 2024]:
        try:
            roster = nfl.import_seasonal_rosters([year])
            if roster.empty:
                continue
            for _, row in roster.iterrows():
                name = str(row.get('player_name', '')).strip()
                team_abbr = str(row.get('team', '')).strip()
                if not name or name == 'nan':
                    continue
                team_full = NFL_FRANCHISES.get(team_abbr, team_abbr)
                # Don't overwrite a 2025 entry with a 2024 one
                key = norm(name)
                if key not in result:
                    result[key] = (name, team_full)
            print(f"  Got {len(result)} NFL players from {year}.")
            if year == 2025:
                break  # 2025 worked, no need for 2024
        except Exception as e:
            print(f"  {year} failed: {e}")
    return result

# ── MLB ───────────────────────────────────────────────────────────────────────

def fetch_mlb_teams():
    print("\nFetching MLB 2025 rosters (pybaseball)...")
    try:
        import pybaseball
        pybaseball.cache.enable()
        batting  = pybaseball.batting_stats(2025, qual=1)
        pitching = pybaseball.pitching_stats(2025, qual=1)
    except Exception as e:
        print(f"  pybaseball failed: {e}")
        return {}

    result = {}

    for df, label in [(batting, 'batting'), (pitching, 'pitching')]:
        # pybaseball returns 'Name' and 'Team'
        name_col = 'Name' if 'Name' in df.columns else None
        team_col = 'Team' if 'Team' in df.columns else None
        if not name_col or not team_col:
            print(f"  Unexpected columns in {label}: {list(df.columns[:6])}")
            continue

        for _, row in df.iterrows():
            name = str(row[name_col]).strip()
            team_abbr = str(row[team_col]).strip()
            team_full = MLB_FRANCHISES.get(team_abbr, team_abbr)
            result[norm(name)] = (name, team_full)

        print(f"  {label}: {len(df)} rows")

    print(f"  Total MLB: {len(result)} players.")
    return result

# ── Apply to player JS files ──────────────────────────────────────────────────

def compact(name):
    """Remove all whitespace for initial-variation matching (e.g. 'a j minter' == 'aj minter')."""
    return re.sub(r'\s+', '', norm(name))

def apply_teams(filepath, team_map, sport_label):
    # Build a compact-key lookup for fallback matching
    compact_map = {}
    for k, v in team_map.items():
        ck = compact(v[0])
        if ck not in compact_map:
            compact_map[ck] = v

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    matched = unmatched = 0
    unmatched_names = []
    out = []

    for line in lines:
        s = line.strip()

        # Only process active (non-commented) player lines
        if s.startswith('//') or not (s.startswith('"') and s.endswith('",')):
            out.append(line)
            continue

        player_str = s[1:-2]  # strip leading " and trailing ",

        # Skip if already has team
        if '|' in player_str:
            out.append(line)
            continue

        # Strip any leftover year range
        name = re.sub(r'\s*\(\d{4}-[\w]+\)$', '', player_str).strip()
        key = norm(name)
        ckey = compact(name)

        team_full = None

        if key in team_map:
            team_full = team_map[key][1]
        elif ckey in compact_map:
            # Handles "A. J. Minter" (→ "ajminter") matching "A.J. Minter" (→ "ajminter")
            team_full = compact_map[ckey][1]
        else:
            # Prefix fallback for suffix variants (Jr., III, etc.)
            for k, (_, t) in team_map.items():
                if len(k) >= 6 and (key.startswith(k) or k.startswith(key)):
                    team_full = t
                    break

        if team_full:
            out.append(f'"{name}|{team_full}",\n')
            matched += 1
        else:
            out.append(line)
            unmatched += 1
            unmatched_names.append(name)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(out)

    pct = round(matched / (matched + unmatched) * 100) if (matched + unmatched) else 0
    print(f"\n{sport_label}: {matched} matched ({pct}%), {unmatched} without team")
    if unmatched_names:
        print(f"  Sample unmatched: {unmatched_names[:10]}")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    nba_map = fetch_nba_teams()
    nfl_map = fetch_nfl_teams()
    mlb_map = fetch_mlb_teams()

    print("\n── Applying teams to player files ──")
    apply_teams(os.path.join(BASE, 'nba_players.js'), nba_map, 'NBA')
    apply_teams(os.path.join(BASE, 'nfl_players.js'), nfl_map, 'NFL')
    apply_teams(os.path.join(BASE, 'mlb_players.js'), mlb_map, 'MLB')

    print("\nDone! Review with: git diff nba_players.js nfl_players.js mlb_players.js")
