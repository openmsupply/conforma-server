**Note: this information is substantially out of date and will be refreshed at some point soon.**

It's possible to create a 'snapshot' of current state of database `yarn take_snapshot` and load that snapshot via `yarn use_snapshot`, optional snapshot parameter can be specified `yarn take/use_snapshot {snapshot name}`, defaults to `current`

### What is a Snapshot ?

A single file collection of GraphQL mutations that can restore database to the state at which that snapshot was taken. This can of course can be done with `pg_dump` or by copying `pg_data` files, the advantages of single file GraphQL mutation (and the snapshot mechanism):

- It's easier to see the changes (especially when comparing diff of an operation)
- It's easier to make manual changes to the mutations in the snapshot
- Extra flexibility of table filtering via `graphQLdefinitions.js`

### Temp snapshot

Snapshots with `temp` in their name are git ignored

### Snapshot diff

To see database changes between 'operations', take a snapshot and commit it to a new branch (or straight into working branch, make sure to delete the snapshot if you don't want it appearing in your PR), do the operation, and diff should be visible

Can also take a `temp` snapshot, and compare in VS code (by selecting two snapshots in file list, then right click and `Compare Selected`)

### Insert data and snapshots ?

Snapshotting is not a replacement of existing `initialisation` and `insertion of data` (`yarn database_init`), but the plan is to only have `static` configuration in `insertData` (template, permissions). And use snapshots for things like applications state

Ideally `current snapshot` will be inline with snapshot created straight after `yarn database_init`

### How are Snapshots generated ?

`graphQLdefinitions.js` and GraphQL introspection query is used (introspection query is taken from `/graphiql`, check network in browser dev tools when that tool is loaded) to determine what tables were queried (and in which order). Promise.all resolved queries are executed to fetch data from DB, and subsequently turned to mutations:

- `generatedColumns` from graphQLdefinitions are commented out to avoid postgres constraint conflicts
- any fields of type `timestamp` are commented out (with value removed), to reduce diff, and allow for automated `diff` checking between snapshots (can be used in unit tests)

Field list for query and mutation are extracted from introspection

See `takeSnapshot.js`.

### graphQLdefinitions.js

This file list table names and some configurations that affect snapshot output. New tables that are snapshottable should be included in the list.

Shape of table snapshot

```JS
{
    table: '{name of table}',
    skip: '{boolean, default to false}',
    generatedColumns: ['{GraphQL column name}'] // used to comment out column in mutation (cannot update those columns directly)
}
```

**order is important** it's quite important that the mutations are placed inside the snapshot in correct order (in the same order that they appear in definitions file), to avoid constraint conflicts (i.e foreign key does not exists 'yet')

With some minor modifications is should be possible to have multiple definition files and be able to select certain definition file to create a snapshot of just that set of data

### TODO

- Migration, when database schema is changed that may affect existing data, we would ideally want to create the following (so that older snapshots an be used, especially for unit testing)
  - Version the schema update and create sql commands for schema changes
  - Add migration of data for that particular version
  - Create a mechanism to apply the above tow for each version, if current DB instance is belows that version
  - This way snapshot can be loaded with the database version with which it was created, then migrations are executed to bring it up to speed with current DB schema
- Files
  - Extra things like `files` folder should be bundles with a snapshot
- Definitions
  - Have multiple definition sets with ability to choose which definitions set to use (i.e just application data, or just the actionQueue etc..)
- Show example of how snapshots can be used in unit tests
