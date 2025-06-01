import datetime
import json
import re
import requests
from pathlib import Path


def read_existing_puzzles():
    """Read existing puzzle data from puzzles.js file."""
    puzzles_file = Path("src/puzzles.js")
    puzzle_data = {}

    if puzzles_file.exists():
        try:
            with open(puzzles_file, "r") as f:
                content = f.read()

            # Extract the puzzle data object using regex
            # Look for: export const puzzleData = { ... };
            pattern = r"export const puzzleData = ({.*?});"
            match = re.search(pattern, content, re.DOTALL)

            if match:
                # Get the object string and convert to valid JSON
                obj_str = match.group(1)
                # Convert JavaScript object to JSON format
                obj_str = re.sub(r"(\w+):", r'"\1":', obj_str)  # Add quotes around keys
                obj_str = re.sub(
                    r"'([^']*)'", r'"\1"', obj_str
                )  # Convert single quotes to double

                # Remove trailing commas (JSON doesn't allow them)
                obj_str = re.sub(r",(\s*[}\]])", r"\1", obj_str)

                try:
                    puzzle_data = json.loads(obj_str)
                    print(f"📚 Loaded {len(puzzle_data)} existing puzzle dates")
                except json.JSONDecodeError as e:
                    print(f"⚠️  Failed to parse existing puzzle data: {e}")
            else:
                print("⚠️  No puzzle data found in existing file")

        except Exception as e:
            print(f"⚠️  Error reading existing puzzles: {e}")
    else:
        print("📝 No existing puzzles.js found, creating new file")

    return puzzle_data


def generate_puzzles_js(puzzle_data):
    """Generate the updated puzzles.js file."""
    # Sort dates for consistency
    sorted_dates = sorted(puzzle_data.keys())

    js_content = "export const puzzleData = {\n"

    for date in sorted_dates:
        puzzles = puzzle_data[date]
        js_content += f"  '{date}': {{\n"

        for difficulty in ["easy", "medium", "hard"]:
            if difficulty in puzzles:
                js_content += f"    {difficulty}: '{puzzles[difficulty]}',\n"

        js_content += "  },\n"

    js_content += "};\n"

    # Write to src directory
    output_path = Path("src/puzzles.js")
    with open(output_path, "w") as f:
        f.write(js_content)

    total_puzzles = sum(len(puzzles) for puzzles in puzzle_data.values())
    print(f"✅ Updated {output_path}")
    print(f"📈 Total: {len(puzzle_data)} dates, {total_puzzles} puzzles")


def main():
    print("🔍 Scraping today's puzzles...")

    # Read existing puzzle data
    puzzle_data = read_existing_puzzles()

    # Get today's date
    today = datetime.date.today()
    date_str = today.strftime("%Y-%m-%d")

    # Check if we already have puzzles for today
    if date_str in puzzle_data:
        print(f"📅 Puzzles for {date_str} already exist, updating...")
    else:
        print(f"📅 Adding new puzzles for {date_str}")

    # Scrape puzzles from NY Times
    url = "https://www.nytimes.com/puzzles/sudoku/hard"
    response = requests.get(url)

    pattern = r'<script type="text\/javascript">window\.gameData = (.+)<\/script><\/div><div id="portal-editorial-content">'
    match = re.search(pattern, response.text)

    if match:
        data = json.loads(match.group(1))

        # Extract puzzles for today
        today_puzzles = {}
        for difficulty in ["easy", "medium", "hard"]:
            puzzle = data[difficulty]["puzzle_data"]["puzzle"]
            puzzle_string = "".join(str(p) for p in puzzle)
            today_puzzles[difficulty] = puzzle_string
            print(f"🧩 Scraped {difficulty}: {puzzle_string[:20]}...")

        # Add to puzzle data
        puzzle_data[date_str] = today_puzzles

        # Generate updated puzzles.js
        generate_puzzles_js(puzzle_data)

        print(f"🎉 Successfully updated puzzles for {date_str}")

    else:
        raise Exception("Failed to find game data.")


if __name__ == "__main__":
    main()
