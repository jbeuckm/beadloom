// The database schema version this build of the app expects: the number of
// the newest file in db/migrations. The sync engine reads schema_migrations
// through the Data API and refuses to sync against an older database, telling
// the owner to run `npm run db:migrate` instead of failing on a missing column.
export const REQUIRED_SCHEMA_VERSION = 8;
