# guild_hall/town_crier

## 목적

- `town_crier/` 는 Soulforge 공용 notify transport owner 다.
- 각 owner 가 만든 notify request 를 queue 에서 소비하고 Telegram 으로 전달한다.

## state

- local state 는 `guild_hall/state/town_crier/**` 아래에만 둔다.
- queue, runner state, send log, telegram env 는 이 경로 아래에서 자란다.
