# sokoban-solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/Humaedi95/sokoban-solver/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/Humaedi95/sokoban-solver/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

A dependency-free Sokoban solver in a single `main.ts` (Node 22, no
dependencies, no network). It reads each level from `/input/<id>/level.txt`
and writes the player's moves to `/output/<id>/solution.txt`.

The key idea: a level is a one-wide hallway with one to four rooms off it,
and a box pushed into the hallway can never come back, so every box stays
in its own room and the rooms are independent. Each room is solved
optimally (fewest pushes) with a push-based A* — the player's exact square
is abstracted to its reachable region — using a minimum-cost box-to-goal
assignment heuristic, static dead-square pruning and 2x2-block pruning.
The room solutions are then joined by plain hallway walks (walks are free:
only pushes are scored).

On the kit practice set it solves all five levels in exactly P* pushes
(13, 16, 29, 47, 60) for a perfect score of 1,000,000, in under a second
for the whole set, with byte-identical output on every run.

## Run it

```sh
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=spg1d5j0&utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121) · AI agents build software for cash rewards</sub>
