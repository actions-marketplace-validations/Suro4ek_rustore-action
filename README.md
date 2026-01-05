# RuStore Publish Action

GitHub Action для загрузки APK/AAB в RuStore.

## Возможности

- Загрузка APK и AAB файлов
- Автоматическое переиспользование существующего черновика
- Скриншоты, описание и прочие материалы наследуются от предыдущего релиза
- При ошибке загрузки черновик сохраняется для повторной попытки

## Получение API ключа

1. Откройте [RuStore Console](https://console.rustore.ru/)
2. Перейдите на страницу вашего приложения
3. В меню слева выберите **"API RuStore"**
4. Нажмите **"Создать ключ"**
5. Сохраните:
   - **Key ID** — отображается в консоли
   - **Приватный ключ** — скачается автоматически (уже в base64 формате)

## Использование

```yaml
name: Deploy to RuStore

on:
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Upload to RuStore
        uses: your-username/rustore-action@v1
        with:
          key_id: ${{ secrets.RUSTORE_KEY_ID }}
          private_key: ${{ secrets.RUSTORE_PRIVATE_KEY }}
          application_id: 'com.example.myapp'
          file: 'app/build/outputs/apk/release/app-release.apk'
          whats_new: 'Исправления ошибок и улучшения'
```

## Параметры

| Параметр | Обязательный | По умолчанию | Описание |
|----------|--------------|--------------|----------|
| `key_id` | Да | — | Key ID из RuStore Console |
| `private_key` | Да | — | Приватный ключ (base64) |
| `application_id` | Да | — | Package name приложения |
| `file` | Да | — | Путь к APK или AAB файлу |
| `whats_new` | Да | — | Описание изменений (1-5000 символов) |
| `publish_type` | Нет | `MANUAL` | Тип публикации: `MANUAL`, `INSTANTLY`, `DELAYED` |
| `mobile_services` | Нет | `Unknown` | Тип сервисов: `HMS` или `Unknown` (только для APK) |
| `priority_update` | Нет | `0` | Приоритет обновления (0-10) |
| `submit` | Нет | `true` | Отправить на модерацию после загрузки |

## Выходные параметры

| Параметр | Описание |
|----------|----------|
| `version_id` | ID созданной версии |
| `status` | Статус: `submitted` или `draft` |

## Примеры

### Загрузка без отправки на модерацию

```yaml
- uses: your-username/rustore-action@v1
  with:
    key_id: ${{ secrets.RUSTORE_KEY_ID }}
    private_key: ${{ secrets.RUSTORE_PRIVATE_KEY }}
    application_id: 'com.example.myapp'
    file: 'app-release.apk'
    whats_new: 'Новая версия'
    submit: 'false'
```

### Загрузка AAB с мгновенной публикацией

```yaml
- uses: your-username/rustore-action@v1
  with:
    key_id: ${{ secrets.RUSTORE_KEY_ID }}
    private_key: ${{ secrets.RUSTORE_PRIVATE_KEY }}
    application_id: 'com.example.myapp'
    file: 'app-release.aab'
    whats_new: 'Важное обновление безопасности'
    publish_type: 'INSTANTLY'
    priority_update: '5'
```

### Использование выходных параметров

```yaml
- name: Upload to RuStore
  id: rustore
  uses: your-username/rustore-action@v1
  with:
    key_id: ${{ secrets.RUSTORE_KEY_ID }}
    private_key: ${{ secrets.RUSTORE_PRIVATE_KEY }}
    application_id: 'com.example.myapp'
    file: 'app-release.apk'
    whats_new: 'Обновление'

- name: Print version ID
  run: echo "Version ID: ${{ steps.rustore.outputs.version_id }}"
```

## Настройка секретов

1. Перейдите в репозиторий → **Settings** → **Secrets and variables** → **Actions**
2. Добавьте секреты:
   - `RUSTORE_KEY_ID` — Key ID из консоли
   - `RUSTORE_PRIVATE_KEY` — содержимое файла приватного ключа

## Поведение при ошибках

- **Черновик уже существует** — используется существующий черновик
- **Ошибка загрузки файла** — черновик сохраняется, ошибка выводится в лог
- **versionCode меньше предыдущего** — ошибка RuStore, нужно увеличить versionCode в приложении

## Лицензия

MIT
