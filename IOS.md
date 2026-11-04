# Хрум на iPhone

## Вариант 1 — бесплатно, через Expo Go (5 минут)
1. На iPhone установите **Expo Go** из App Store.
2. На компьютере установите Node.js (https://nodejs.org, версия LTS).
3. Откройте терминал в папке `Hrum-app` и выполните:
   ```
   npm install
   npx expo start
   ```
4. Наведите камеру iPhone на QR-код в терминале — «Хрум» откроется в Expo Go.
   Компьютер и телефон должны быть в одной Wi-Fi сети (или запустите `npx expo start --tunnel`).

Данные хранятся на телефоне внутри Expo Go.

## Вариант 1б — без компьютера каждый раз (бесплатно)
1. Зарегистрируйтесь на https://expo.dev (бесплатно).
2. В папке проекта:
   ```
   npm install
   npx eas-cli login
   npx eas-cli update:configure
   npx eas-cli update --branch main --message "Хрум"
   ```
3. Команда покажет ссылку/QR — откройте её на iPhone один раз. Проект «Хрум» останется в списке Expo Go и будет запускаться без компьютера (нужен интернет при первом запуске и для обновлений).

## Вариант 2 — настоящее приложение (нужен Apple Developer, $99/год)
```
npm install -g eas-cli
eas login
eas build -p ios --profile preview
```
Сборка идёт в облаке Expo (Mac не нужен). После сборки EAS даст ссылку — откройте её на iPhone и установите приложение.
При первом запуске `eas build` сам предложит войти в Apple-аккаунт и создать сертификаты.

## Вариант 3 — .ipa без Mac и без $99 (GitHub Actions + Sideloadly)
1. Создайте приватный репозиторий на GitHub и загрузите туда папку `Hrum-app` (файл `.github/workflows/ios.yml` уже внутри).
2. В репозитории: **Actions → «iOS .ipa» → Run workflow**. Через ~15–20 минут в разделе Artifacts появится `Hrum-unsigned.ipa`.
3. На Windows установите **Sideloadly** (sideloadly.io), подключите iPhone кабелем, перетащите .ipa и войдите своим Apple ID.
4. На iPhone: Настройки → Основные → VPN и управление устройством → доверять разработчику; включите «Режим разработчика».

Ограничение Apple: с бесплатным Apple ID подпись действует 7 дней — затем повторить шаг 3 (данные приложения сохраняются). Минуты macOS на GitHub для приватных репозиториев расходуются из бесплатного лимита быстрее (×10), одной-двух сборок в месяц хватает.

## Если сборка iOS не запускается на GitHub Actions

Есть два разных по природе сбоя — сначала проверяйте причину, не угадывайте:

1. **"The job was not started because recent account payments have failed or your spending limit needs to be increased"** (видно в аннотациях прогона, `gh run view <id>`) — это не дефицит раннеров, это биллинг GitHub. Чинится только в **Settings → Billing and plans** на самом GitHub (карта/лимит расходов на Actions). Пока не починено — не запустится НИ ОДИН раннер, любой версии. Запускать параллельно разные версии в этом случае бессмысленно.
2. **"The job was not acquired by Runner of type hosted even after multiple attempts"** — это реальный дефицит свободных macOS-машин у GitHub (у них это бывает, особенно для macos-26/arm64). В этом случае помогает параллельный запуск нескольких версий раннера сразу:
   - Используйте `.github/workflows/ios-alt.yml` (ручной выбор версии через `workflow_dispatch` input `runner`), и диспатчьте по одному разу на несколько версий сразу (`gh api -X POST .../workflows/ios-alt.yml/dispatches -f ref=main -f "inputs[runner]=macos-15"` и так для каждой версии).
   - Какой бы раннер ни стартовал первым (`status=in_progress`, не `queued`) — остальные отменить (`gh run cancel <id>`), чтобы не жечь лишние платные минуты.
   - Новый/изменённый workflow-файл может не появиться в `gh api repos/.../actions/workflows` сразу после пуша — иногда индексация занимает несколько минут. Если диспатч возвращает 404 — подождите и попробуйте снова, это не ошибка в файле.

**Важно: не все версии образа одинаково пригодны.** `macos-14` несёт Xcode 15.4, а текущий React Native в проекте требует Xcode ≥ 16.1 — сборка падает на `pod install` с ошибкой `React Native requires XCode >= 16.1`. На практике из актуальных вариантов подходят **macos-15** и **macos-26** (и `macos-latest`/`macos-latest-large`, если они на момент сборки указывают на достаточно новый образ — проверяйте). `macos-13`/`macos-14` для сборки iOS этого проекта не годятся.

Ходовые версии образов GitHub-раннеров на момент написания: `macos-13`, `macos-14`, `macos-15`, `macos-26`, плюс алиасы `macos-latest` и `macos-latest-large` (xlarge-вариант с большим числом ядер, платится дороже). Список может меняться — актуальный смотрите в `actions/runner-images` на GitHub.
