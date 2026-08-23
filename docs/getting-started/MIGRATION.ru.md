# Миграция с private 0.1.23

[English version](MIGRATION.md)

Линия `0.1.23` является историческим private deployment. Переход на generic
profile `v0.2.0-alpha` выполняется через staged cutover с точным backup.

## Подготовка

1. Зафиксируйте текущий source/image revision и версии worker.
2. Создайте и проверьте SQLite snapshot, сохраните legacy token map в приватном
   credential store оператора.
3. Скачайте и проверьте self-hosted bundle `v0.2.0-alpha`.
4. Скопируйте snapshot в изолированный staging data directory.
5. Настройте generic bundle с прежним public URL и точным allowed host.
6. Запустите его на отдельном loopback/private port и выполните
   `aopctl doctor`.

Первый generic startup создаёт `credential.key` и добавляет enrollment/device
tables. `AOP_DEVICE_TOKENS` сохраняется в alpha как migration-only
compatibility source. Новые установки используют одноразовый enrollment.

## Переключение

1. Остановите запись в старый coordinator и создайте финальный pre-cutover
   backup.
2. Запустите generic coordinator с финальной базой и staging
   `credential.key`.
3. Проверьте health, один legacy heartbeat, MCP access и один vertical request.
4. Переключите edge route.
5. Создайте fresh enrollment для каждого host и обновляйте worker по одному.
6. Проверьте heartbeat и контрольную задачу, затем revoke/remove
   соответствующий legacy credential.
7. Удалите `AOP_DEVICE_TOKENS` после миграции всех identities.

## Rollback

Верните прежний edge route и immutable runtime `0.1.23`. Используйте
pre-migration SQLite snapshot. Сохраните migrated database отдельно для
диагностики. Re-enrolled worker должен получить прежний legacy credential из
приватного store оператора до подключения к старому coordinator.

Не смешивайте databases и `credential.key` из разных staged attempts. Для
generic profile используйте [backup и restore](../OPERATIONS.ru.md#backup-и-restore).
