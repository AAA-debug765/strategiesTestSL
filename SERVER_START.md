# SERVER START INSTRUCTION

## Проблема
Sandbox убивает ВСЕ дочерние процессы в момент завершения bash-команды.
Поэтому сервер живёт только пока bash-команда не закончилась.
Решение: в конце команды ставим `sleep` чтобы не дать ей завершиться.
Максимальное время жизни одной команды: ~30 секунд.

## Просто оставить сервер работать

```bash
pkill -9 -f "next" 2>/dev/null; sleep 1; cd /home/z/my-project && > dev.log && setsid bash -c 'exec node node_modules/.bin/next dev -p 3000 -H 0.0.0.0' > dev.log 2>&1 & disown; sleep 25
```

timeout: 35000

## Сервер + браузер (всё в одной команде)

```bash
pkill -9 -f "next" 2>/dev/null; pkill -9 -f "agent-browser" 2>/dev/null; sleep 1
cd /home/z/my-project && > dev.log
setsid bash -c 'exec node node_modules/.bin/next dev -p 3000 -H 0.0.0.0' > dev.log 2>&1 &
disown
sleep 5
agent-browser open http://127.0.0.1:3000/
agent-browser snapshot -i
# ... остальные действия ...
```

## Критические детали

1. **`-H 0.0.0.0` обязателен** — без него Next.js не отвечает на 127.0.0.1
2. **`setsid` + `exec`** — создаёт новую сессию, заменяет bash на node
3. **НЕ `bun run dev`** — скрипт содержит пайп через tee
4. **Порядок**: pkill → sleep 1 → > dev.log → старт → sleep 25
5. **sleep в конце** — единственное что мешает sandbox убить процесс

## Проверка живости

```bash
curl -s -m 2 http://127.0.0.1:3000/api/strategies | head -c 50
```

## Логи

```bash
tail -30 /home/z/my-project/dev.log
```