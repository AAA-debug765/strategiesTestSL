# Futures Backtester — Work Log

## Проект
Платформа бэктестинга фьючерсных стратегий: Next.js 16 + TypeScript + lightweight-charts v5 + shadcn/ui.

## Текущий статус
✅ Проект успешно перенесён из GitHub репозитория `AAA-debug765/strategiesTestSL`
✅ Dev server запущен и работает через Caddy proxy (порт 81)
✅ Git remote настроен, push на GitHub работает
✅ Все 8 стратегий загружаются и валидируются

## Архитектура
- `src/app/page.tsx` — Главная страница: top bar (символ/интервал/даты) + chart + sidebar
- `src/components/strategy-panel.tsx` — Панель стратегии, TP/SL/Fee, метрики, Top 30, таблица сделок
- `src/components/strategy-context.tsx` — Глобальный стейт (React Context), API вызовы, localStorage
- `src/components/candlestick-chart.tsx` — lightweight-charts v5 с маркерами сделок
- `src/components/equity-chart.tsx` — Мини-график кривой эквити
- `src/lib/backtest.ts` — Движок бэктеста (all-in, одна позиция, $initialCapital)
- `src/app/api/optimize/route.ts` — Оптимизатор (grid search + funnel mode с 2 проходами)
- `src/app/api/binance/route.ts` — Прокси для данных Binance
- `src/strategies/` — 8 стратегий (ma-cross, rsi, bollinger, compression-state-machine, geometry-release, memory-hole, candle-energy, alternate)

## Реализованные функции
- TP/SL в USDT (абсолютная цена) или % от цены входа
- Комиссия в стиле KuCoin, вычитается на входе и выходе
- Настраиваемый начальный капитал (по умолчанию $10,000)
- Wheel scroll на инпутах TP/SL/Fee/capital
- Таблица сделок: PnL $, PnL %, Fee $, причина выхода
- Маркеры на графике: L/S для входов, TP/SL для выходов
- Оптимизация: grid search с прогрессом и ETA, funnel mode (2 прохода)
- Подсветка сделки на графике при клике в таблице
- Выбор точности десятичных знаков на графике
- Сохранение параметров в localStorage

## Потерянные стратегии (из предыдущей сессии)
- `territorial-control.ts` (3 параметра)
- `false-capture.ts` (6 параметров)
— нужно пересоздать по описанию пользователя

## Рабочий метод запуска сервера
```bash
cd /home/z/my-project && > dev.log && setsid bash -c 'exec node node_modules/.bin/next dev -p 3000 -H 0.0.0.0' > dev.log 2>&1 & disown
```
Важно: `-H 0.0.0.0` обязателен (без него сервер не отвечает на 127.0.0.1).
Сервер живет только внутри одной bash-команды — между вызовами инструментов sandbox убивает процессы.

## GitHub
- Remote: https://github.com/AAA-debug765/strategiesTestSL.git
- Branch: main
- Токен: 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

## Ключевые решения
- Одна позиция за раз (iron rule)
- All-in позиционирование полным капиталом
- TP/SL внутри бара: SL проверяется первым (безопасность)
- USDT TP/SL: прямой расчёт цены `entryPrice ± tpUsdt / positionSize`

---
Task ID: 1
Agent: main
Task: Исправить неработающий оптимизатор (404 на /api/optimize/status)

Work Log:
- Диагностика: в dev.log обнаружены сплошные 404 на GET /api/optimize/status?jobId=...
- Корневая причина: в Next.js 16 + Turbopack модуль `optimize/route.ts` компилируется как отдельный инстанс для каждого API-роута. `jobs` Map, будучи переменной уровня модуля, не разделялся между POST /api/optimize и GET /api/optimize/status
- Исправление: вынес `jobs` Map в `globalThis` через функцию `getJobsMap()` с ключом `__backtester_opt_jobs__`
- Обновлены все обращения к `jobs` в POST и DELETE обработчиках
- Добавлен `-H 0.0.0.0` в dev-скрипт package.json
- Добавлен `allowedDevOrigins` в next.config.ts

Stage Summary:
- Оптимизатор снова работает: curl-тест с funnel mode — 5940 комбинаций за секунды, 100 результатов
- Браузер-тест: полная цепочка POST→polling→done→результаты в таблице работает
- Проверено через agent-browser: таблица показывает #, Max SL, Trades, параметры стратегии
- Запушено 2 коммита: fix optimizer 404 + config improvements
