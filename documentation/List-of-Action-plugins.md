## Contents <!-- omit in toc -->
<!-- toc -->
- [Console Log](#console-log)
- [Change Outcome](#change-outcome)
- [Increment Stage](#increment-stage)
- [Change Status](#change-status)
- [Modify Record](#modify-record)
- [Modify Multiple Records](#modify-multiple-records)
- [Generate Text String](#generate-text-string)
- [Generate Text/JSON file](#generate-textjson-file)
- [Join User to Organsation](#join-user-to-organsation)
- [Remove User from Organsation](#remove-user-from-organsation)
- [Grant Permissions](#grant-permissions)
- [Revoke Permissions](#revoke-permissions)
- [Generate Review Assignments](#generate-review-assignments)
- [Refresh Review Assignments](#refresh-review-assignments)
- [Trim Responses](#trim-responses)
- [Update Review Visibility](#update-review-visibility)
- [Update Review Statuses](#update-review-statuses)
- [Generate Document](#generate-document)
- [Send Notification](#send-notification)
- [Schedule Action](#schedule-action)
- [Clean Up Files](#clean-up-files)
- [Get Values](#get-values)
- [Aliasing existing template actions](#aliasing-existing-template-actions)
- [Core Actions](#core-actions)
<!-- tocstop -->

**Note**: Many of these actions won't need to be specifically configured as they are ["Core Actions"](#core-actions) and hard-coded to work correctly for all templates.

---

### Console Log

Just prints a message to the console. For demo purposes only.

_Action Code:_ **`cLog`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `message`\*                              |                   |

---

### Change Outcome

Set the Outcome of an application to the input parameter ("Pending", "Approved", "Rejected")

- _Action Code:_ **`changeOutcome`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `applicationId`                          | `applicationId`   |
| `newOutcome`\*                           | `newOutcome`      |

**Note:** If `applicationId` is not provided, the plugin will attempt to retrieve it from `applicationData`.

---

### Increment Stage

Changes the application Stage to the next in the sequence

- _Action Code:_ **`incrementStage`**

  - If a new application, will create a corresponding Status set to "Draft"
  - If application is already on final stage, will leave unchanged
  - If application outcome is anything other than PENDING, will leave unchanged

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `applicationId`                          | `applicationId`   |
|                                          | `stageNumber`     |
|                                          | `stageName`       |
|                                          | `stageId`         |
|                                          | `status`          |
|                                          | `statusId`        |

**Note:** If `applicationId` is not provided, the plugin will attempt to fetch it from `applicationData`

---

### Change Status

- Changes the application or review Status to the specifed input parameter

- _Action Code:_ **`changeStatus`**

| Input parameters<br />(\*required) <br/> | Output properties                      |
| ---------------------------------------- | -------------------------------------- |
| `applicationId` or `reviewId`            | `applicationId` or `reviewId`          |
| `newStatus` \*                           | `status`                               |
| `isReview`                               | `statusId`                             |
|                                          | `applicationStatusHistoryTimestamp` or |
|                                          | `reviewStatusHistoryTimestamp`         |


If we are wanting to change the status of a **review**, the parameter `isReview` should be set to `true`. If `applicationId` or `reviewId` are not provided, plugin will try to retrieve from `applicationData`.

**Note:**: If `isReview` is not provided, it default to `true` if the Action was triggered by a review. However, this means that if we want to set the status of an Application when a review is triggered, then we will need to explicitly set `isReview: false`.

---

### Modify Record

Creates or updates a database record on any table, and creates/updates a related JOIN table to associate the updated record with the application that caused it.

- _Action Code:_ **`modifyRecord`**

| Input parameters<br />(\*required) <br/>       | Output properties                             |
| ---------------------------------------------- | --------------------------------------------- |
| `tableName`\*                                  | `operation`: "CREATE" \| "UPDATE" \| "DELETE" |
| `matchField`                                   | `<tableName>` object                          |
| `matchValue`                                   |                                               |
| `delete` (default `false`)                     |                                               |
| `ignoreNull` (default `true`)                  |                                               |
| `shouldCreateJoinTable` (default `true`)       |                                               |
| `noChangeLog` (default `false`)                |                                               |
| `regenerateDataTableFilters` (default `false`) |                                               |
| `data` (shorthand for multiple fields at once) |                                               |
| `patch` (pre-constructed data object)          |                                               |
| `...fields for database record`                |                                               |

The Action first checks if `<tableName>` exists in the database and creates it if not. It creates fields matching the incoming record and makes a best match of the data type from one of the following postGres data types:

- `date`
- `time with timezone`
- `timestamptz` (date and time)
- `jsonb` (object)
- `boolean`
- `integer` (number)
- `double precision` (number)
- `varchar` (string)
- `array` (whose element type is any of the above)

Any time a record is inserted or updated on a table, if the field name doesn't exist it will be created accordingly. (See below for detail on how the record is constructed)

The Action then checks if a record already exists, based on the `matchField` (e.g. `username`) and `matchValue` (e.g. the value of `username` to check). If it exists, the record will be updated, otherwise a new record is created.

If `matchField` is not provided, it will default to `id`.

If `matchValue` is not provided, it will use the value supplied with the record for that field. So you only really need to provide `matchValue` if you're changing the value of `matchField`. (Note that if the table in question has *multiple* records where `matchField` is `matchValue`, they will *all* be updated.)

For example:

```
{
  tableName: 'user',
  matchField: 'username',
  username: 'js',
  email: 'john@msupply.foundation'
}
```

This will look for a user record with `username = "js"` and update it if found.

Whereas:

```
{
  tableName: 'user',
  matchField: 'username'
  matchValue: 'js',
  username: 'john',
  email: 'john@msupply.foundation'
}
```

This will look for a user record with `username = "js"` and update it with the _new_ username of `john`.

Records can be *deleted* from the database using the `delete` parameter. In that case, any records which match the `matchValue` will be removed rather than updated.

#### How the record is built

The full record to be inserted/updated is built from a combination of the `data` parameter, the `patch` parameter, and any other non-specific parameters included in the input. Separated field parameters can be of any degree of complexity (i.e. [evaluator](Query-Syntax.md) expressions), so may be necessary in some cases. However, the vast majority of data fields inserted will be straight mappings from application responses (and there can be an awful lot of them in some workflows!), so we can use the `data` parameter object as a shorthand to map several fields using a more straightforward syntax all at once -- the `data` object is structured with key-value pairs like so:
```
{ <field-name> : <property-from-applicationData>, ... }
```

For example:
```
{
  firstName: "responses.Q1.text",
  lastName: "responses.Q2.text",
  applicant: "username",
  dateOfBirth: "responses.DOB.date.start" (from Date picker)
}
```

If we had the above `data` parameter, along with the following additional parameters in the input:
```
{
  ...
  registration: <some-complex-evaluator-query-to-database>,
  currentTime: <fetch-current-timestamp-using-"objectFunctions">
}
```

We can also add multiple fields at once with the `patch` parameter -- these are passed through unmodified, e.g

```
{
  isExternalUser: true,
  somethingElse: 99
}
```

You would use the `patch` parameter if you are getting a group of fields from a single source (e.g. a single form response, or an API query)


The resultant database record that would be inserted would look something like this:
```
{
  first_name: "Fred",
  last_name: "Smith",
  applicant: "bob",
  date_of_birth: "23/12/2012",
  registration: "XYZ-123",
  current_time: "2022-02-24T11:13:49.987Z",
  is_external_user: true,
  something_else: 99
}
```

(Note that the `camelCase` input fields are converted to `snake_case` in the Postgres database)

It is recommended to use the `data` parameter object, or `patch` when possible. The standalone field parameters should be reserved for when the required value is not available directly from `applicationData`.

`ignoreNull`: By default, any `null` values in the incoming data are ignored -- they won't replace existing values, nor creating new fields. This is preferable in most cases, as it can be hard to create an expression that conditional omits a field, and so setting it to `null` is usually the easiest way to handle it if we don't want a certain field changed under certain conditions. However, this behaviour can be over-ridden by setting `ignoreNull: false`, in which case `null` values are treated the same as any other.

`regenerateDataTableFilters`: if you have ["filter data" columns](Data-View-Filters.md#handling-complex-data-structures) defined for filtering this data table, the `regenerateDataTableFilters` flag will ensure that the "generateFilterDataFields" script will run and compute the relevant filter data values for the new record. By default this is `false`, but you should enable it for all instances of `modifyRecord` where you are inserting data that can be viewed in [Data Views](Data-View.md). Even if you have no filter data filters defined currently, having this set to `true` ensures that any definitions you configure in the future will automatically create the appropriate filter data values for new records.

`noChangeLog`: The `modifyRecord` action causes an entry to be added to the `data_changelog` database table so we have a record of all data modifications (after record's initial creation) done in the system. This can be over-ridden by setting `noChangeLog: true` (or `noChangeLog: false` if you need to add a log for new record creation). It is not recommended to change the default in most cases -- we want an audit trail. It is mostly used by a few core actions so we don't clutter up the changelog table with common application table changes, etc. 

`changeLogComment`: When an entry is added to the `data_changelog`, this value will be added to the `comment` field.

**Notes:**

- fields with a value of `null` will be omitted from the database update, so any current values will remain unchanged.
- you can create a record without adding a JOIN table record by explicitly setting `shouldCreateJoinTable: false`
- the data type of each field is set the first time a record is added with that field in it, so subsequent insertions/updates *must* match the data type for that field.

---

### Modify Multiple Records

- Allows creating or updating *multiple* database records. It basically just calls the above `modifyRecord` action multiple times.

- _Action Code:_ **`modifyMultipleRecords`**

| Input parameters<br />(\*required) <br/>       | Output properties      |
| ---------------------------------------------- | ---------------------- |
| `tableName`                                    | `records: [<results>]` |
| `matchField`                                   |                        |
| `matchValue`                                   |                        |
| `shouldCreateJoinTable` (default `true`)       |                        |
| `data` (shorthand for multiple fields at once) |                        |
| `records`\*                                    |                        |
| `keyMap`                                       |                        |

Most of these parameters are the same as for `modifyRecord`. The `records` parameter is an array of records, structured similarly. Each record can have its own `tableName`, `matchField`, etc. within it, but if they're all going to be the same, then global values can be used. Parameters within each record will take priority over the global ones.

The output `records` property is an array of results, each structured as per a single `modifyRecord` output.

The `keyMap` property is used if the `records` have field names different from what you need the database field to be named. You provide an object which maps record field names to database field names -- the `keys` are the names of the fields in the database, and the `values` are the record fields that get mapped to them. 

For example:

```
{
  name: "entered_name",
  age: "entered_age"
}
```
This will look for fields `entered_name` and `entered_age` on the incoming records and insert the associated values in to database fields `name` and `age`, respectively.

Note that when a `keyMap` is present, *only* the fields explicitly named in the map will be inserted into the database; all other fields in the records will be ignored. By default, *all* record fields are inserted into the database, so if you want to only include a subset, you can just provide a `keyMap` of the fields you want to keep mapped to themselves. For example if you have a record `{name: "John", age: 28, isStaff: true}` but you only want to write the `name` field to the database, just provide `keyMap: {name: "name"}`.


---

### Generate Text String

Generates serial numbers or arbitrary text strings (e.g. for application name) using a specified pattern, and updates a database record if requested.

- _Action Code:_ **`generateTextString`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `pattern`\*                              | `generatedText`   |
| `counterName`                            |                   |
| `counterInit`                            |                   |
| `customFields`                           |                   |
| `numberFormat`                           |                   |
| `fallbackText`                           |                   |
| `updateRecord` (default `false`)         |                   |
| `tableName`                              |                   |
| `fieldName`                              |                   |
| `matchField` (default `"id"`)            |                   |
| `matchValue` (default `applicationId`)   |                   |
| `additionalData`                         |                   |

This action achieves two things:

1. Generate strings based on pre-defined patterns, and;
2. (Optionally) update database records based on the generated string (e.g. update the application name on application submission)

It uses the [custom_string_patterns](https://www.npmjs.com/package/custom_string_patterns) package (which is, in turn, based on [randexp](https://www.npmjs.com/package/randexp)). It provides a shorthand for defining strings, which can include:

- random values based on regular expressions
- incrementing, persistent counters
- custom replacement functions
- object data replacement.

**A quick example:**

The pattern: `<?templateCode>-[A-Z]{3}-<+dddd>` consists of:

- `<?templateCode>` - will be replaced by the template code
- `[A-Z]{3}` a regular expression specifying 3 random upper-case characters in the A to Z range
- `<+dddd>` will be replaced with a four-digit number from a counter.

So for an "Organisation Registration" application, this pattern would result in a sequence of output strings like:  
`OrgRegistration-KUD-0100`  
`OrgRegistration-JNI-0101`  
`OrgRegistration-QLF-0102`

#### Parameters summary

The parameters can be considered in two distinct groups -- parameters for defining how to generate the string, and parameters for updating a database record.

##### String parameters

- `pattern`: defines the structure of the generated string. Please see the custom_string_patterns [documentation](https://www.npmjs.com/package/custom_string_patterns) for full detail, but the quick summary is:

  - regular expressions generate random strings that match the regex
  - `<+ddd>` inserts a number from a counter (see below for more detail about counters), with each `d` specifiying a digit (will be padded with leading 0's to fill the required length).
  - `<applicationData.username>` - this just specifies the name of a property to replace into the output string.

  - `<?field>` - the `?` specifies that this is a customReplacement function. A simplified version is used in this Action, so any `?` strings just represent a shorthand for a data field -- the mapping of these names to actual fields is specified in `customFields` (see below)

- `counterName`: if the pattern specifies a counter, this field specifies the name of the counter to use. There can be any number of different counters in the system -- they are stored in the `counter` database table with a unique name and current value. Each time a value is retrieved, the number is automatically incremented by 1.

- `counterInit`: if `counterName` doesn't already exist in the `counter` table, it will be created when first called, and its value will be set to the value specified in `counterInit` (or 1 if `counterInit` not set).

- `additionalData`: by default, `applicationData` and `outputCumulative` are passed to the string generator, so any fields on those objects (e.g. `applicationName`) are available, but other data can be made accessible with the `additionalData` field.

- `customFields`: as mentioned above, `customFields` just specifies a mapping from the replacement function (`<?xxxx>`) in the pattern to the exact property in the data objects available. So, in the example pattern above, we have `<?templateCode>`. The `customFields` parameter specifies where to find `templateCode`, like so:

  `customFields: { templateCode: applicationData.templateCode }`

  `customFields` are not necessary, they just provide a "shorthand" to write more concise string patterns. This pattern would result in the exact same thing:

  ```
  <applicationData.templateCode>-[A-Z]{3}-<+dddd>
  ```

  Note that this syntax doesn't required the `?` marker in the `< >`

- `fallbackText`: if the named property is not found in the supplied data, the replacement will instead be the value specified in `fallbackText`

##### Update record parameters

`updateRecord`: needs to be explicity set to `true` to update the database.

This action actually just calls [modifyRecord](#modify-record) to update the database, so the following parameters are the same as for in that action:

- `tableName`
- `fieldName`
- `matchField` (default `id`)
- `matchValue` (default `applicationId`)

##### More examples:

1.

```
{
  pattern: "S-[A-Z]{3}-<+dddd>"
  counterName: {
    operator: "objectProperties"
    children: [ "applicationData.templateCode" ]
  }
  counterInit: 100
  updateRecord: true
  tableName: "application"
  fieldName: "serial"
}
```

This generates serial numbers such as:  
`S-XLD-0100`  
`S-ZEH-0101`  
`S-DXF-0102`

It gets the number from a counter named from the `templateCode` via evaluator expression look-up, starts counting at 100, then saves the generated string to the `serial` field on the `application` table.

2.

```
{
    pattern: "<?templateName> - <?productName>",
    customFields: {
        templateName: "applicationData.templateName",
        productName: "applicationData.responses.Q20.text"
    }
    updateRecord: true
    tableName: "application"
    fieldName: "name"
}
```

This will update the application name with the template name and the product name, which we can see in this is extracted from `Q20` of the applicant's responses. As explained above, the pattern could just be expressed as `<applicationData.templateName> - <applicationData.responses.Q20.text>` with no `customFields`, but in this case it helps make clear what `Q20` actually holds (i.e. "product name")

The resulting application names would be things like:  
`Drug Registration - Paracetamol`  
`Drug Registration - Amphetamine`

---

### Join User to Organsation

Creates a link between a user and an organisation -- i.e. user is a "member" of that organisation. Adds a new record to the `user_organisation` table.

- _Action Code:_ **`joinUserOrg`**

| Input parameters<br />(\*required) <br/>   | Output properties |
| ------------------------------------------ | ----------------- |
| `userId`\*                                 | `userOrgId`       |
| `orgId` \*                                 |                   |
| `userRole` (Arbitrary title, e.g. "Owner") |                   |

---

### Remove User from Organsation

The opposite of `joinUserOrg`. Removes user from company by deleting the `user_organisation` record.

- _Action Code:_ **`removeUserOrg`**

| Input parameters<br />(\*required) <br/>   | Output properties                                  |
| ------------------------------------------ | -------------------------------------------------- |
| `username` or `userId`                     | `removedUsers: {userOrgId, userId, orgId} [Array]` |
| `orgName` or `orgId` o `organisation_id`\* |                                                    |
| `deletePermissions` (default `true`)       |                                                    |

In `removeUserOrg` the field to define from which organisation to remove user(s) `orgId` or `orgName` is compulsory, but you _can_ omit the user. In that case, it is treated as "remove ALL USERS". Also a flag defining if it should also remove any permission for removed user(s) on that organisation can be passed. After each user is removed there is no way to revert that action unless rejoinng the user to the organisation on one of provided workflows.

---

### Grant Permissions

Grants permission to user/org -- i.e. creates `permission_join` from user/org to permission name.

- _Action Code:_ **`grantPermissions`**

| Input parameters<br />(\*required) <br/> | Output properties                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `username`  or `userId`                  | `grantedPermissions: { permissionJoinId, permissionNameId, permissionName } [Array]` |
| `orgName`  or `orgId`                    |                                                                                      |
| `permissionNames`\* [Array of names]     |                                                                                      |

It is possible to grant a permission to just a user (i.e. user acting without an organisation) or just an organisation (i.e. all members of org). In these cases the "username"/"userId" or "orgName"/"orgId" must be *explicitly* set to `null` -- if either is simply `undefined` the action will return a "Fail" result.

---

### Revoke Permissions

Revokes permissions from to user/org -- i.e. sets the `is_active` field to `false` on `permission_join` for a given user/org and permission name.

- _Action Code:_ **`revokePermissions`**

| Input parameters<br />(\*required) <br/> | Output properties                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `username` or `userId`                   | `revokedPermissions: { permissionJoinId, permissionNameId, permissionName } [Array]` |
| `orgName` or `orgId`                     |                                                                                      |
| `permissionNames`\* [Array of names]     |                                                                                      |
| `isRemovingPermission` (default: `true`) |                                                                                      |

`revokePermissions` works differently to `grantPermissions`, in that you *can* omit the user or the org. In that case, it is treated as "apply to ALL". So if you only provide an `orgId`, it'll remove any permission for that organisation, regardless of which user (or `null`) is linked with it. However, if you explicitly set `null` for one of the values, it'll only match `null`.

The `isRemovingPermission` parameter specifies whether or not the `permission_join` record should be _deleted_ (the default behaviour) or just set to inactive (which would mean the user can still _view_ their applications but not create new ones, or submit existing). _**NOTE**: This functionality not actually implemented yet in policies/front-end, so only full removal should be used currently -- TO-DO_

See [Grant Permissions](#grant-permissions) above regarding acting on user-only or org-only permission joins.

---

### Generate Review Assignments

Generates records in the `review_assignment` table -- i.e. which users (reviewers) are allowed to do a review for the current stage/level (and for which Sections). 
- Records are set with `status` "Available" or "Assigned". 
- Each record has properties to specify the type of assignment: 
  - `isSelfAssignable` if it should show for self-assignment when not assigned by another user
  - `isLocked` defining that the review can start but not be submitted (Used for applications which has been sent back to Applicant for ammendments)

It also creates records in the `review_assignment_assigner_join` table -- basically a list of users who have permission to make the _assignments_ in the review_assignment table.

This action also removes `reviewAssigments` and `reviewAssignmentAssignerJoins` in case a permission no longer applies to a user to be reviewing an application.

Should be run whenever an application or review is submitted or re-submitted, and it will generate the review assignments for the next _review_ that should be done. Also runs using flag `isRegeneration` when new permissions are granted/revoked to reviewers in order to update existing reviewAssignments.

- _Action Code:_ **`generateReviewAssignments`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `applicationId`                          | `levels`          |
| `reviewId`                               |                   |
|                                          |                   |
|                                          |                   |
|                                          |                   |

**Notes**:

- If `applicationId` only is passed the action will generate reviewAssignments for **all** review levels on the current stage up to and including the current level. As well as generating first level review assignments for the first application submissiong, this also accounts for the case when an applicant *re-submits* after making changes and we need to generate fresh review_assignments for the first level even though higher level review assignments already exist (it will also regenerate the higher levels, but this won't cause any problems).
- If `reviewId` is also received the action will generate reviewAssignments for the **next** level of reviews in the current stage or - if it was the last level on current stage, generate for 1st level of the **next** stage. Nothing is created if it reached the last level & stage.
- In all of the cases, when a `reviewAssignment` record already exist (i.e. if it's a re-assignment), they will just be updated (with a new timestamp).

---

### Refresh Review Assignments

A "super-action", which regenerates all `review_assignment` and `review_assignment_assigner_join` records associated with a specific user, or group of users (or all users). It does this by figuring out which active applications are associated with the input user(s), and then running [`generateReviewAssignments`](#generate-review-assignments) on each of them.

Should be run whenever the permissions for any user are changed.

- _Action Code:_ **`refreshReviewAssignments`**

| Input parameters<br />(\*required) <br/> | Output properties     |
| ---------------------------------------- | --------------------- |
| `userId`                                 | `updatedApplications` |


**Notes**:

- `userId` can be a single user (number) _OR_ an array of `userId`s
- if `userId` is omitted completely, then ALL active applications will have their review assignments re-generated. Useful for manually running and fully updating the system assignments.

---

### Trim Responses

Whenever an application or review is submitted, this Action "cleans up", by deleting all responses that have not changed since the last submission (or are `null`). Also, the remaining responses have their timestamps (`timeUpdated`) updated to match the timestamp of the most recent status_history (application or review, as appropriate).

- _Action Code:_ **`trimResponses`**

| Input parameters<br />(\*required) <br/> | Output properties  |
| ---------------------------------------- | ------------------ |
| `applicationId` _OR_                     | `deletedResponses` |
| `reviewId`                               | `updatedResponses` |

---

### Update Review Visibility

Updates the applicant visibility of level 1 review responses based on the recommendations of the last-level review. I.e. it generate the "List of Questions" the applicant sees for making changes to their application.

- _Action Code:_ **`updateReviewVisibility`**

| Input parameters<br />(\*required) <br/> | Output properties                      |
| ---------------------------------------- | -------------------------------------- |
| `reviewId`                               | `reviewResponsesWithUpdatedVisibility` |

**Note:** If `reviewId` is not provided, the plugin will attempt to fetch it from `applicationData`

---

### Update Review Statuses

When an applicant re-submits an application after making changes, or a reviewer submits their review, this Action updates the status of associated reviews to determine whether they should be "Pending" or "Changes Requested" (or left as is). We only consider "active" reviews, so those with status "Discontinued" are ignored.

The logic is as follows:

**ON_APPLICATION_SUBMIT**:
- For all Level 1 "SUBMITTED" reviews that have sections that have changed responses, set status to "PENDING".

**ON_REVIEW_SUBMIT**:
- Set review one level higher than this review to "PENDING". (This should cover cases when reviewer is reviewing new applicant changes AND when they themselves have had to change an existing review before sending back to applicant).
- If this review is not level 1 (i.e. it's a Consolidation), the lower level reviews that have sections that have responses marked as REJECTED (meaning that this reviewer has disagreed with), will change status to "CHANGES REQUESTED".

- _Action Code:_ **`updateReviewsStatuses`**

| Input parameters<br />(\*required) <br/> | Output properties          |
| ---------------------------------------- | -------------------------- |
| `applicationId`                          | `updatedReviews`           |
| `reviewId`                               | `updatedReviewAssignments` |
| `changedResponses`\*                     |                            |
| `level`                                  |                            |
| `stageId`                                |                            |

`changedResponses` is an array of `applicationResponseId`s or `reviewResponseId`s and is usually provided by the output of the `trimResponses` action (which must run first).

**Note:** - If `applicationId` or `reviewId` is not provided, the plugin will attempt to fetch it from `applicationData`. In case the `reviewId` is received, this Action will be updating status of related reviews of same stage in the current and next level reviews. Otherwise (for an application submit - without passing `reviewId`) this Action will be updating only reviews of current level/stage.

---

### Generate Document

Generates a PDF file based on a [Carbone](https://carbone.io/api-reference.html) document template.

- _Action Code:_ **`generateDoc`**

| Input parameters<br />(\*required) <br/> | Output properties                          |
| ---------------------------------------- | ------------------------------------------ |
| `docTemplateId`\*                        | `document: {uniqueId, filename, filepath}` |
| `options`                                |                                            |
| `appicationSerial`                       |                                            |
| `templateId`                             |                                            |
| `userId`                                 |                                            |
| `data`                                   |                                            |
| `additionalData`                         |                                            |
| `isOutputDoc`                            |                                            |
| `description`                            |                                            |


The Action utilises the internal `generatePDF` function, which is also accessible via the [`/generate-pdf` endpoint](API.md)

`docTemplateId` specifies the uniqueId of the carbone template file (from the "file" table) and `options` optional can define a localisatiion to be used for dates and currency formatting.

The data used by the action primarily comes from `applicationData` and `outputCumulative`, which are flattened/spread into a combined object to the carbone processer. Extra data (such as from individual responses, or other expressions) can be provided in one of two ways:

- `data`: this parameter is an object in which you can define a simple mapping between field names required by Carbone and fields on `applicationData`. This is the same as the mapping available in `modifyRecord`, so please [see modifyRecord plugin](#modify-record) info for more detail and examples.
- `additionalData`: another object, but does no mapping, so each value must either be a literal value or an evaluator expression. In the latter case, you'll need to create the object using the [`buildObject` operator](Query-Syntax.md#buildobject).


The full data object is constructed and sent to the Carbone processor like so:

```
data: { ...applicationData, ...outputCumulative, ...data(mapped), additionalData }
```
(Note that the first three are flattened to the root `data` object, whereas `additionalData` is contained all within the `additionalData` field)

`userId` and `applicationSerial` are not required for functioning, but will be stored as fields in the resulting "file" record. If `applicationSerial` is supplied, the output PDF file will be stored in a subfolder named for the application serial.

Similarly, `isOutputDoc` and `description` (boolean) will populate their respective fields in the "file" record. These are used to mark the "output" documents generated by an application (e.g. licenses, certificates) that show up in the "Documents" tab of the "Review" summary page.

The output object `document` provides the `uniqueId`, `filename`, and `filepath` (relative to server root) of the generated document, so it can be accessed by subsequent actions

---

### Generate Text/JSON file

Generates a text file and saves it anywhere on the system. Can optionally register the file in the database for internal use as well.

- _Action Code:_ **`generateTextFile`**

| Input parameters<br />(\*required) <br/> | Output properties            |
| ---------------------------------------- | ---------------------------- |
| `text`                                   | `outputFilePath, outputText` |
| `data`                                   |                              |
| `filename`\*                             |                              |
| `outputPath`                             |                              |
| `registerInDatabase`                     |                              |
| `fileData`                               |                              |

The file contents can be provided by *either* `text` (`string`), or `data` (`object`), with `text` taking precedence if both are present. The `data` object is serialised to JSON for text output.

A `filename` is required.

The `outputPath` can be either a relative path (e.g. `text/myFolder`) or an absolute one (e.g. `/Users/me/my/path`). If relative, then if the file is not to be registered in the database (i.e. it won't be referenced by Conforma in future), the path will be relative to the Home folder. If it *is* to be registered in the database, it will be placed relative to the system's "files" folder. If no `outputPath` is provided, it will default to `_textFiles`.

Set `registerInDatabase` to `true` in order to record the file record in the database. Note that you cannot use an absolute path when registering in database, as all database files are referenced relative to the "files" folder.

Do **not** put any files in the "files" folder if they are not registered in the database, as they'll be deleted in the next scheduled "file cleanup".

---

### Send Notification

Generates notifications and sends email. For now, there is no UI for notifications in the app, so emails are the primary means of notifying users. A notification record is stored in the database though ("notification" table).

- _Action Code:_ **`sendNotification`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `subject`\*                              | `notification`    |
| `message`\*                              |                   |
| `email`, `to` (either)                   |                   |
| `cc`                                     |                   |
| `bcc`                                    |                   |
| `userId`                                 |                   |
| `fromName`                               |                   |
| `fromEmail`                              |                   |
| `attachments`                            |                   |
| `sendEmail`                              |                   |

This action requires the use of an external SMTP server for sending the emails. You'll need to provide configuration details for this in the `config.json` file within this actions folder. The SMTP password needs to be stored seperately in the system's (non-shared) `.env` or passed in as an argument at runtime (when running on production server). When storing it in .env, use this format:

```
SMTP_PASSWORD=<password>
```

`subject` and `message` are just the email subject line and message

`to (email)`, `cc`, `bcc` -- the email address(es) to send the email to, in the "to" "cc" and "bcc" fields, respectively. Can be a string (single email address) or an array of strings if multiple recipients.

`userId` for the notification recipient.

`fromName` / `fromEmail` refer to who the apparent sender of the email is. Default value(s) should be supplied in `config.json`, but can be over-ridden on a case-by-case basis.

`sendEmail` -- if `true` (this is default), an email will be sent, otherwise a notification record will be created with no email sent. Note, also -- if there are no valid email addresses supplied (in any of the `to`, `cc` or `bcc` fields), no email will be sent either, but a valid notification record will still be created.

`attachments` -- any files to attach with the email.

- Files should already be in the system and have an associated uniqueId.
- Use a _single string_ with the uniqueId if only one attachment - example sending the generated pdf from the outputCumulative object
- Use an array of uniqueId strings if there is more than one attachment. (Although it would require using something specific to generate an array of objects key/value since the objectProperty is not to be used inside arrays -- in order to get outputCumulative results for example).

**Note**: It is possible to send external files by using a url, but this is not fully reliable as yet -- please see the "prepareAttachments" comment in `sendNotification.ts` if you'd like to try that.

The output object `notification` contains all the fields from the notification record:

`id, user_id, application_id, review_id, email_recipients, subject, message, attachments, email_sent, is_read`

---

### Schedule Action

A "special" action that allows other actions to be triggered at some time in the future, which can be used to expire licenses, registrations, or notify of upcoming deadlines.

- _Action Code:_ **`scheduleAction`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `duration`                               | `scheduledEvent`  |
| `date`                                   | `scheduledEvent`  |
| `eventCode`                              |                   |
| `applicationId`                          |                   |
| `templateId`                             |                   |
| `cancel`                                 |                   |
| `data`                                   |                   |

*Either* of `duration` or `date` is required

This Action stores an "event" in the database `trigger_schedule` table, scheduled for a time in the future specified by `duration` (a certain length of time from *now*) or `date` (a specific point in time). When this time is reached, a special trigger is fired (`ON_SCHEDULE`) which can be used as the trigger for subsequent actions.

Each scheduled event can be saved with an `eventCode` -- this is used by Actions that are triggered by this event to determine *which* action should be fired for any given `ON_SCHEDULE` trigger on each template type. Every Action defined for each template has an optional `scheduledActionCode` field, which can be used to match specific events. If no event code is provided, then *every* action for that template type with an `ON_SCHEDULE` trigger will be executed.

By default, when an event is saved, the `outputCumulative` object from the `scheduleAction` action (including outputs of previous actions in the sequence) is stored in the `data` field, but additional data can be added to this as well. Then when the scheduled action runs, it gets this data passed in as `outputCumulative` -- this means it effectively can continue as though it were part of the same sequence of actions, but with a "pause" due to the schedule.

The `cancel` parameter is a way to prevent a previously scheduled event from occurring. Passing in `cancel: true` will, instead of creating a new event, find any *existing* event that has matching `applicationId` and `eventCode` and set to to inactive without it ever firing. In practice, though, targeting an event by `applicationId` is often not feasible, so the preferred way to cancel a scheduled event is to just apply an appropriate Condition to the subsequent action -- so the event is still triggered, but the matching action won't occur if the condition is not met (e.g. don't expire a product if registration has been renewed)

Note:
- the `duration` value can be *either* a number (representing time in weeks) or an object in [Luxon Duration format](https://moment.github.io/luxon/api-docs/index.html#duration).
- the `date` value can be *either* an ISO string, a JS Date object or an object in [Luxon DateTime format](https://moment.github.io/luxon/api-docs/index.html#datetime)


---

### Clean Up Files

Action to remove files no longer connected to application responses -- for example, when an applicant uploaded files then removed them from their response before submission. Should be run on application submission to "clean up" files that are no longer required in the system

- _Action Code:_ **`cleanupFiles`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `applicationId`                          | `deletedFiles`    |
| `applicationSerial`                      | `submittedFiles`  |

Can supply *either* `applicationId` or `applicationSerial`, although this can be inferred from `applicationData` if neither is supplied.

Note: There is a database trigger/postgres listener to automatically delete files when their database record is deleted, so we only need to delete the records, not the files themselves.

---

### Get Values

Very simple action to simply retrieve a value (or values) and make them available in `outputCumulative` to subsequent actions. Useful when you have several actions in a sequence that all make the same query (e.g. fetching info from database) -- rather than putting the same complex query as a sub-expression in every action (which is tedious and error-prone), we can just fetch it once at the start of the sequence and make it available to the following actions.

- _Action Code:_ **`getValues`**

| Input parameters<br />(\*required) <br/> | Output properties |
| ---------------------------------------- | ----------------- |
| `{ ...values }`                          | `{ ...values }`   |

The output is identical to the input. Presumably the input would be one or more evaluator queries to retrieve some data -- after evaluation these are passed to output unmodified.

### Aliasing existing template actions

Finally, we have this "special" action which allows us to create an alias to an existing template action. The use for this is if you have configured a complex action with a lot of parameters or queries, and you wish to run it with slight differences for a document preview (for example), you can just set an alias to the original action instead of configuring and maintaining the same thing twice within the template (LINK TO PREVIEW DOCUMENTATION WHEN ITS DONE)

In fact, this is not really an action at all -- it's just a dummy plugin that makes the action library and front-end (and therefore template_actions) see it as an available action. But all the logic is handled internally as part of the `processTrigger` functionality -- if it sees an "alias" action, the function simply swaps it out with the template action it is referencing.

- _Action Code:_ **`alias`**

| Input parameters<br />(\*required) <br/> | Output properties                  |
| ---------------------------------------- | ---------------------------------- |
| `code`\*                                 | `output as per the aliased action` |
| `shouldOverrideCondition`                |                                    |
| `...any other aliased action parameters` |                                    |

To be able to reference an existing template action, it needs to have a unique (per template) code in its template_action record.

Then this alias action just passes in the code of the action it's referencing and the trigger processor will swap it out for that one.

By default the (original/aliased) action runs with the condition and parameters it has defined, but these can be overridden by the alias. For example, if you have a `sendNotification` action which normally runs with `sendEmail: true` (the default), but you don't want emails going out when previewing, you'd just supply the parameter `sendEmail: false` to the alias and that would override the `sendNotification` parameter on this occasion.

The "condition" field (common to all template_actions) can also override the original action's condition. However, every action has `condition: true` by default, so we ignore the alias action's condition if it's set to `true`. In the event that you actually *want* this to override the original action's condition (i.e. run the original action no matter what), then you'll need to set the `shouldOverrideConditon` to `true` (that's the only condition this parameter would need to be specified).

---

## Core Actions

There are certain Actions that _must_ run on particular events to facilitate a standard application/review workflow process. We have called these **Core Actions**, and have hard-coded them into the server to ensure that they cannot be tampered with, misconfigured or accidentally removed. It also allows us to make any changes in one place and know that all templates will behave correctly without further re-configuration.

The core actions are contained in a single object, indexed by trigger, in `coreActions.ts` in the back-end. Each action in there has a comment describing what it does and why it is required, but here is a summary and some relevant notes:

**ON_APPLICATION_CREATE**:
- Generate application serial (`generateTextString`). Default pattern `S-[A-Z]{3}-<+dddd>` but can be over-ridden in the Template Builder "General" tab
- Set initial stage (`incrementStage`) (Also sets the status to "DRAFT")
- Generate application name (`generateTextString`) based on template code and serial. This can be over-ridden just by specifying an additional `generateTextString` action in the template actions configuration.

**ON_APPLICATION_RESTART**:  
(This runs when an applicant re-starts an application after a reviewer requests changes)
- Set application status to "DRAFT" (`changeStatus`)

**ON_APPLICATION_SUBMIT**:
- Set status to "SUBMITTED" (`changeStatus`)
- Trim duplicate or empty applicant responses (`trimResponses`)
- Generate review assignments (`generateReviewAssignments`) for the level 1 reviewers
- Clean up (delete) any files that were uploaded but not submitted as part of the application (`cleanupFiles`)
- Update review status (`updateReviewStatuses`) for any existing reviews based on applicant responses that have been changed since the last submission.
- Change outcome to "APPROVED" (`changeOutcome`), but *only if* there are no other `changeOutcome` actions defined for this template *and* it is a non-reviewable (i.e. automatic) template. So if you need to change the behaviour or condition of when the outcome changes, you can define a specific template action, which will ensure this automatic one doesn't run.

**ON_REVIEW_ASSIGN**:
- If any reviews already exist for this assignment, set them to "DRAFT" (this would only happen if the reviewer had been unasssigned and then re-assigned) (`updateReviewStatuses`)

**ON_REVIEW_CREATE**:
- Set review status (`changeStatus`) to "DRAFT"

**ON_REVIEW_RESTART**:
- Set review status (`changeStatus`) to "DRAFT" when reviewer re-starts their review (after an applicant re-submission, or request for changes from a senior reviewer)

**ON_REVIEW_SUBMIT**:
- Set review status (`changeStatus`) to "SUBMITTED"
- Remove unchanged or empty review responses (`trimResponses`)
- Update status of *other* reviews (`updateReviewStatuses`) to "PENDING" or "CHANGES REQUESTED" based on reviewer responses. (Higher level reviews will be set to "PENDING", lower-level reviewers will depend on which response the reviewer agreed with.)
- Set which review responses are visible to the applicant (`updateReviewVisibility`) if sending a request for further information (LOQ).
- Increment stage (`incrementStage`), but only if this review is a last-level review with the decision "CONFORM". Any other conditions for incrementing the stage must be specified in additional template actions.
- Set application status to "CHANGES REQUIRED" (`changeStatus`) if this is a last-level review and the decision is "LOQ".
- Change outcome (`changeOutcome`), but only if this is the final stage and it's a final level review, and the decision is "CONFORM" or "NON_CONFORM". Outcome will be "APPROVED" or "REJECTED" accordingly.
- Create or update review assignments (`generateReviewAssignments`) for the *next* review level (if there is one)

**ON_REVIEW_UNASSIGN**:
- If any reviews already exist (i.e. previousuly-assigned reviewer has started their review), set the review status (`changeStatus`) to "DISCONTINUED"


