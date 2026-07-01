# SERVER START INSTRUCTION

## Когда применять
Если dev-сервер не отвечает (curl отказывается, агент-браузер показывает "can't be reached"), перезапусти сервер.
Проверяй через `curl -s -m 3 http://127.0.0.1:3000/api/strategies | head -c 50`.

## Старт сервера (ОДНА команда!)

```bash
pkill -9 -f "next" 2>/dev/null; sleep 1; cd /home/z/my-project && > dev.log && setsid bash -c 'exec node node_modules/.bin/next dev -p 3000 -H 0.0.0.0' > dev.log 2>&1 & disown; sleep 5; curl -s -m 3 http://127.0.0.1:3000/ > /dev/null && echo "SERVER OK" || echo "SERVER FAIL"
```

## Критически важные детали

1. **Всегда одной командой** — между вызовами инструментов sandbox убивает дочерние процессы. Если запустил сервер в одном вызове Bash, а тестируешь в другом — сервер уже мёртв. Все действия (старт + тест/браузер) делай в одной bash-команде с `&&`.

2. **`-H 0.0.0.0` обязателен** — без этого флага Next.js слушает только на localhost (::1), и curl на 127.0.0.1 получает ECONNREFUSED.

3. **`setsid` + `exec`** — `setsid` создаёт новую сессию (отрывает от терминала), `exec` заменяет bash-процесс на node (без лишнего посредника).

4. **НЕ используй `bun run dev`** — в package.json скрипт содержит пайп `| tee dev.log`, который создаёт process group и умирает вместе с родителем.

5. **НЕ используй `nohup` без `setsid`** — alone недостаточно, sandbox всё равно убивает.

6. **Порядок**: сначала `pkill`, потом `sleep 1` (дождаться освобождения порта), потом `> dev.log` (очистить лог), потом старт.

## Проверка что сервер жив

```bash
curl -s -m 3 http://127.0.0.1:3000/api/strategies | head -c 50
```

Если пустой ответ или ошибка — сервер мёртв, перезапускай.

## Логи

```bash
tail -30 /home/z/my-project/dev.log
```

## Если нужно работать с браузером

Включи запуск сервера и все команды agent-browser в ОДИН вызов Bash:

```bash
pkill -9 -f "next" 2>/dev/null; pkill -9 -f "agent-browser" 2>/dev/null; sleep 1
cd /home/z/my-project && > dev.log
setsid bash -c 'exec node node_modules/.bin/next dev -p 3000 -H 0.0.0.0' > dev.log 2>&1 &
disown
sleep 5
agent-browser open http://127.0.0.1:3000/
# ... остальные команды ...
```