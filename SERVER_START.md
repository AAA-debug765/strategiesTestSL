# SERVER START INSTRUCTION

## Рабочий метод запуска

```bash
cd /home/z/my-project && bun run dev 2>&1 | tee /home/z/my-project/dev.log &
disown
```

## Почему именно так

- `bun run dev` — стандартный запуск Next.js (в package.json уже `-H 0.0.0.0`)
- `2>&1 | tee dev.log &` — сервер пишет в pipe, tee пишет в файл. Pipe держит процесс живым после завершения bash-команды
- `disown` — отвязывает от shell
- **НЕ `> dev.log`** — прямой редирект в файл убивает сервер при завершении команды (sandbox закрывает fd)
- **НЕ `setsid bash -c 'exec node ...'`** — тоже умирает

## Перезапуск

```bash
pkill -f "next" 2>/dev/null; sleep 1; cd /home/z/my-project && bun run dev 2>&1 | tee /home/z/my-project/dev.log & disown
```

## Проверка

```bash
curl -s -m 3 http://127.0.0.1:3000/api/strategies | head -c 30
```

## Логи

```bash
tail -30 /home/z/my-project/dev.log
```

## Браузер-тест (всё в одной команде)

```bash
pkill -f "next" 2>/dev/null; pkill -f "agent-browser" 2>/dev/null; sleep 1
cd /home/z/my-project && bun run dev 2>&1 | tee /home/z/my-project/dev.log & disown
sleep 5
agent-browser open http://127.0.0.1:3000/
# ... остальные действия ...
```