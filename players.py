import pandas as pd
import time

def get_nba_players_stable():
    print("Fetching NBA data season-by-season (2000-2025)...")
    
    player_data = {} # Using a dict to track { "Player Name": [years] }
    
    # Loop through the last 26 seasons
    for year in range(2000, 2026):
        print(f"  Processing the {year} season...")
        url = f"https://www.basketball-reference.com/leagues/NBA_{year}_totals.html"
        
        try:
            # Read the 'Totals' table for that year
            # This contains every player who stepped on the court
            tables = pd.read_html(url)
            df = tables[0]
            
            # Clean up the table (remove the header rows that repeat every 20 players)
            df = df[df['Player'] != 'Player']
            
            # Get the list of names from this season
            names = df['Player'].unique()
            
            for name in names:
                if name not in player_data:
                    player_data[name] = {"start": year, "last": year}
                else:
                    # Update the last year seen
                    player_data[name]["last"] = year
            
            # Pause for 2 seconds to be respectful to the server and avoid being blocked
            time.sleep(2)
            
        except Exception as e:
            print(f"  Could not fetch {year}: {e}")
            continue

    # Format for config.js
    formatted_entries = []
    for name, years in player_data.items():
        start = years["start"]
        last = years["last"]
        
        # Logic: If they played in 2025, label as 'Current'
        end_label = "Current" if last >= 2025 else str(last)
        
        formatted_entries.append(f'"{name} ({start}-{end_label})",')

    # Sort and save
    formatted_entries.sort()
    
    with open('nba_config_list_final.txt', 'w', encoding='utf-8') as f:
        f.write("\n".join(formatted_entries))
    
    print(f"\nSuccess! Created list with {len(formatted_entries)} NBA players.")

if __name__ == "__main__":
    get_nba_players_stable()