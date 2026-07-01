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

## GitHub
- Remote: https://github.com/AAA-debug765/strategiesTestSL.git
- Branch: main
- Токен: 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

## Ключевые решения
- Одна позиция за раз (iron rule)
- All-in позиционирование полным капиталом
- TP/SL внутри бара: SL проверяется первым (безопасность)
- USDT TP/SL: прямой расчёт цены `entryPrice ± tpUsdt / positionSize`
