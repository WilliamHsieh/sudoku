import datetime
import json
import re
import requests


def main():
    url = "https://www.nytimes.com/puzzles/sudoku/hard"
    response = requests.get(url)

    pattern = r'<script type="text\/javascript">window\.gameData = (.+)<\/script><\/div><div id="portal-editorial-content">'
    match = re.search(pattern, response.text)

    if match:
        data = json.loads(match.group(1))

        for difficulty in ["easy", "medium", "hard"]:
            puzzle = data[difficulty]["puzzle_data"]["puzzle"]
            print(puzzle)

            path = f"./board/nytimes/{difficulty}/{datetime.date.today().strftime('%Y-%m-%d')}"

            with open(path, "w") as f:
                output = "".join(str(p) for p in puzzle)
                f.write(output)
                print(f"Puzzle saved to {path}")

    else:
        raise Exception("Failed to find game data.")


if __name__ == "__main__":
    main()
