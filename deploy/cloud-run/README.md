# Временный показ в Google Cloud Run

Из корня репозитория в авторизованном Cloud Shell запустите `bash deploy/cloud-run/deploy.sh`.
Скрипт создаёт отдельный сервис `ale-archive-preview` в проекте `saq-qurylys`, регионе `europe-west1`. Сервис `saq-qurylys-api` не изменяется. После появления ссылки Cloud Shell можно закрыть.

PostgreSQL работает внутри контейнера; Firebase и Cloud SQL не используются. При запуске восстанавливается снимок реальных материалов из репозитория. Идентификаторы исходных материалов сохраняются в пределах одной сборки. Новые пользовательские изменения при перезапуске теряются: это профиль для показа, а не постоянное хранение.

Пределы: один экземпляр, 1 CPU, 2 GiB памяти, масштабирование до нуля. Первый запрос после простоя требует холодного запуска. Бесплатные квоты зависят от аккаунта и использования; Cloud Build и хранение Artifact Registry могут расходовать кредиты или тарифицироваться. Нулевая стоимость не гарантируется.

Администратор создаётся для текущего аккаунта Cloud Shell. Пароль находится только в `~/.ale-archive-preview/credentials.json`; не отправляйте его в чат. Файлы с секретами исключены из контекста сборки.

После показа удалите только созданные ресурсы:

```bash
gcloud run services delete ale-archive-preview --project=saq-qurylys --region=europe-west1
gcloud artifacts repositories delete ale-archive-preview --project=saq-qurylys --location=europe-west1
```

Проверка локально собранного образа: `mkdir -p .local && node tests/cloud-run-preview.mjs` (Docker, образ `aleteam-cloud-preview:local`, свободный порт 3124). Проверяются исходные данные, страницы, файлы, вход, ответ ИИ со ссылкой на фонд и восстановление после перезапуска. Результат проверки до развёртывания: `docs/cloud-run-preview/validation.json`.
