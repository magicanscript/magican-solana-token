# magican-token

Простой Solana-токен на Anchor 1.0 для портфолио. 4 инструкции: initialize, mint, burn, transfer.

## Требования

- Rust (`rustup`)
- Solana CLI (`solana-test-validator`)
- Anchor CLI ≥ 0.31 (`anchor --version`)
- Node.js 18+ и yarn

## Установка

```bash
yarn install

magican-token/
├── .gitignore                      ← исключения для git
├── .prettierignore
├── .mocharc.json                   ← конфиг mocha (require: ts-node/register)
├── Anchor.toml                     ← конфиг Anchor (cluster, scripts, programs)
├── Cargo.toml                      ← workspace root
├── Cargo.lock
├── package.json                    ← npm-зависимости + scripts
├── yarn.lock
├── tsconfig.json                   ← TypeScript config
├── rust-toolchain.toml             ← фиксирует версию Rust
│
├── README.md                       ← (см. ниже — нужно создать)
├── REFACTORING_REPORT.md           ← отчёт о рефакторинге
├── TESTS_REPORT.md                 ← отчёт о тестах
│
├── app/                            ← (пустая папка — заготовка под frontend)
│   └── .gitkeep
├── migrations/
│   └── deploy.ts                   ← деплой-скрипт Anchor
│
├── programs/
│   └── magican-token/
│       ├── Cargo.toml              ← зависимости программы (anchor-lang, anchor-spl)
│       └── src/
│           ├── lib.rs              ← все 4 инструкции (initialize, mint_token, burn_token, transfer_token)
│           ├── errors.rs           ← MagicanError enum
│           └── events.rs           ← события Anchor
│
├── tests/
│   └── magican-token.ts            ← 7 интеграционных тестов (mocha + chai)
│
└── target/                         ← НЕ в git (в .gitignore)
    └── deploy/magican_token.so     ← собранная программа


Попытки запуска `anchor test`

| # | Ошибка | Что сделано |
|---|--------|-------------|
| 1 | `Account allocation failed` — деплоил на devnet вместо localnet | Не решена через конфиг (оставлено пользователю) |
| 2 | `ts-mocha: command not found` | Заменил на `npx ts-mocha`, потом на `npx mocha` + `.mocharc.json` |
| 3 | `yargs: require is not defined in ES module scope` (Node 26 + yargs@16) | Обновил `mocha` с 9 → 11.7.0 |
| 4 | `Cannot find module 'ts-node/register'` | Переустановил `ts-node@10.9.2` |
| 5 | **`'tokenProgram' does not exist in type 'ResolvedAccounts'`** | **Не решена** — нужно проверить IDL, что там ожидается |

### Текущее состояние

```
✗ tests/magican-token.ts:70:9 - error TS2353: 'tokenProgram' does not exist in type 'ResolvedAccounts<...>'

Что точно работает

- Программа компилируется (`anchor build` → success)
- IDL/типы должны генерироваться автоматически (но `target/` не виден из моих инструментов — стоит проверить руками)
- TypeScript-тесты написаны, синтаксис валиден
- Все остальные зависимости установлены корректно