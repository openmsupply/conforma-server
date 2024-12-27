# API specification

Up-to-date documentation of all endpoints and back-end services for reference of front-end devs.

The back-end currently has two server instances which are launched to handle incoming requests:

- [**Postgraphile**](https://www.graphile.org/postgraphile/) server -- exposes a **GraphQL** endpoint and uses GraphQL queries to access the **PostGres** database.
- [**Fastify**](https://www.fastify.io/) server -- additional endpoints for various services. (Will also serve the actual app when deployed, and will probably have PostGraphile added as a plugin later in development)

---
## Contents

<!-- TOC -->

- [Contents](#contents)
- [Fastify server API](#fastify-server-api)
  - [Postgraphile (GraphQL) route:](#postgraphile-graphql-route)
  - [Authentication](#authentication)
  - [Public endpoints](#public-endpoints)
  - [Authenticated endpoints](#authenticated-endpoints)
  - [Admin only endpoints](#admin-only-endpoints)

<!-- /TOC -->


---

## Fastify server API

`http://localhost:8080` (In Development environment)

### Postgraphile (GraphQL) route:

`http://localhost:8080/graphql` (In Development environment)

Web-based GUI available at:  
`http://localhost:8080/graphiql` (development only)


### Authentication

Endpoints are divided into three group, as far as authentication goes:

- **Public** -- no authentication required
- **Authenticated** -- valid JWT for user required (including nonRegistered user)
- **Admin** -- requires Admin permission (`isAdmin: true` in JWT)

---

### Public endpoints

All are prefixed with `/api/public` e.g `http://localhost:8080/api/public/login`

#### Login

POST: `/login`

Basic login endpoint that will also return (on success):

- User Info
- User Permissions
- JWT token

##### REQUEST Body:

```JSON
{
    "username": "${username}",
    "password": "${password}"
}
```

##### RESPONSE Body (example):

```JSON
{
    "success": true,
    "templatePermissions": {
        "TestRego": [
            "Apply"
        ],
        "CompRego1": [
            "Apply",
            "Review"
        ]
    },
    "JWT": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwcDNwbjN0cDMiOnRydWUsInBwM3BuM3RwM19zdGFnZSI6IjEiLCJwcDNwbjN0cDNfdGVtcGxhdGVJZCI6IjIiLCJwcDNwbjMiOnRydWUsInBwMnBuMnRwMiI6dHJ1ZSwicHAycG4ydHAyX3RlbXBsYXRlSWQiOiIyIiwicHAycG4yIjp0cnVlLCJwcDFwbjF0cDEiOnRydWUsInBwMXBuMXRwMV90ZW1wbGF0ZUlkIjoiMSIsInBwMXBuMSI6dHJ1ZSwidXNlcklkIjoxMCwiYXVkIjoicG9zdGdyYXBoaWxlIiwiaWF0IjoxNjEwMDYwMTQxfQ.X8E7CpwRfVNHgm5wW6Qxp122vZmLr8cwipPXFcx_YUo",
    "user": {
        "id": 10,
        "firstName": null,
        "lastName": null,
        "userId": 10,
        "username": "userWithMultiplePermissions",
        "dateOfBirth": null,
        "email": null
    }
}
```

#### Get preferences endpoint:

GET: `/get-prefs`

Provides current preferences and language options for the current installation. Called by front-end at the very start of loading in order to configure the environment according to system settings.

#### Get language endpoint:

GET: `/language/<language-code>`

e.g. `/language/en_nz` (the default language setting)

Gets the set of localised strings for the core application (i.e. not customisable entities like templates).

#### Verification endpoint

GET: `/verify?uid=<uniqueid>`

Sets the verification record at `<uniqueid>` to `true` and triggers configured Action. Used for verification via email, etc. See [Create Verification Action](List-of-Action-plugins.md) for more info.

#### File download endpoint:

GET: `/file?id=<uniqueId>`

Usage: `GET` request with file database id as a URL query parameter.

*This is a public endpoint, but files all have a long uniqueId which should prevent unauthorized access.*

### Authenticated endpoints

These are all prefixes with `/api`, e.g. `http://localhost:8080/api/login-org`

They require a valid JWT supplied as a Bearer token in the authorization header of the request:

```
Authorization: Bearer <token>
```

#### File upload endpoint:

POST: `/upload`

Usage: `POST` request with file(s) in the request `body` form-data:  
`key: "file" value: <File(s)>`

URL query parameter fields (all optional):

- `user_id`
- `application_serial` (for associating files with their applications)
- `application_response_id` (for specifying what response a file belongs to, useful for the file "clean-up" action)
- `unique_id` (the randomly generated one should normally be sufficient. If this is specifed and the id already exists in the database, the file record will be *updated* with the new file data.)
- `template_id` (to associate a file with a template, for example a carbone template doc)
- `subfolder` (files are placed in subfolder based on the application_serial provided, but a specific subfolder can be defined instead (which over-rides the application subfolder))
- `description` an optional descriptive string for each file. Currently shows up in "Documents" tab of review page, in [Action previews](#preview-actions), and in the application form if `showDescription` is enabled in the `fileUpload` element.
- `isOutputDoc` specifies that the file is a document associated with the outcome of an application. This is used to determine which documents to display on the "Documents" tab of the review home page.
- `isInternalReferenceDoc`/`isExternalReferenceDoc` specifies that the document should appear in the front-end menu bar, under "Help" and "Reference" menus respectively. There is an Admin template called "Manage Reference Docs" that can be used by a system manager to manage these documents.

e.g. `/upload?user=2&application_serial=3`

Files are uploaded to `src/files` with their database table id appended to the filename (to ensure uniqueness).

#### File lists endpoint

GET: `/files`

Provides lists of files to user, filtered by permission. Individual files can always be publicly accessed via the `/file` endpoint (if the file's unique ID is known), but this endpoint provides data (including the unique ID) of a list of files. Either:

- files associated with an application
- internal or external reference docs (shown in main menu bar)

URL query parameter fields (at least one required):

- `applicationId`: if specified, will return a list of all the files associated with this application. Will check the request token for permission to view the application and return an empty array if not allowed.
- `outputOnly`: if `"true"` and an `applicationId` is provided, will only include files that are considered "output" docs -- i.e. documents generated by template actions, such as certificates. Otherwise will include *all* files, including ones uploaded by applicant in their application.
- `internal`: if `"true"`, returns list of internal reference docs. Checks that user is part of an *internal* organisation.
- `external`: if `"true"`, returns list of external reference docs. No additional checks done, as these are publicly available documents.

Note: regardless of the parameters supplied, an array of file data will be returned. If multiple parameters are provided, a single array consisting of a union of all matching files will be returned.

#### Check unique endpoint

GET: `/check-unique`

Endpoint to check if an entity (e.g. username, email) is unique in the system. Needed because the front-end user won't have permission to query the full list of records, only ones they have permission for.

Query parameters:

- `type`: available options: `username`, `email`, `organisation`
- `value`: the value being checked for uniqueness
- `table`: the database table to check
- `field`: the field in the above table to check

Note that `table` and `field` are only required when `type` is not specified -- `type` is basically a table/field shorthand for "username", "email" and "organisation" checks; for any other checks, use `table` and `field`.

Example request URL: `/check-unique/type=email&value=carl@sussol.net`

Check is case-insensitive, so `user99` will return **Not Unique** if `User99` is in the database.

Request will return an object, structured like so:

```
{
  unique: true/false
  message: "Type missing or invalid"/"Value not provided", or <empty string> if all okay
}
```

There are basic unit tests for this endpoint. Run:  
`yarn test src/server.test.ts`

#### Create hash

POST: `/create-hash`

Endpoint to retrieve a [bcrypt](https://www.npmjs.com/package/bcrypt) hash value for a given (password) string. Used by the "Password" form element to hash passwords before saving.


##### REQUEST Body:

Note -- password string must be provided in body json rather than query parameters for security reasons (so string is not in plaintext in url)

```JSON
{
    "password": "${password}"
}
```

##### RESPONSE Body (example):

```JSON
{
    "hash": "$2b$10$DkmOA1ODFlghsj49j.QlvuyZO.9uULn2LDqTYv7MdUSnGVCI1h9aC"
}
```

#### Login Organisation

POST: `/login-org`

Basic login endpoint for organisation. Intended for use after `/login` -- client supplies `userId`, `orgId` and the JWT from `/login` return

Returns (on success):

- User Info (now including selected org info)
- User Permissions (now including `orgId`)
- JWT token

#### User Info

GET: `/user-info`

End point to get user permission and info based on JWT token.

If JWT is invalid or is missing 'nonRegistered' user info will be returned.

##### RESPONSE Body:

The same as login endpoint, without the success field

#### User Permissions

GET: `/user-permissions?username=<username>&orgId=<orgId>`

End point to get **another** user's granted permissions + all existing permissions on templates for a given organisation. Intended for use in template to view/edit another user's permissions -- client supplies `username` and `orgId`.

Either `username` or `orgId` can be omitted and the result returned will be either: 
  * for that user without an org; or 
  * for that org without a user. 
  
For `orgId`, the values `null` or `0` are equivalent to omitting `orgId` and for `username` an empty string `""` can be used. This is useful in cases such as a template query where you're supplying an `orgId` and `username` parameter, but can't "turn off" the parameters when you want to omit either of them -- just use `orgId=null` or `username=""` to achieve the same thing.

##### Usage

GET: `/user-permissions?username=<username>` If no `orgId` is received the list should contain user-only permissions (the ones with organisation_id = NULL) for external users.

GET: `/user-permissions?orgId=<orgId>` If no `username` is received (it has to receive orgId in this case) list all available permissions for an org (checking whether is if internal or external)

**Note**: When using this endpoint to list permissionNames in organisation, they will be listed as `availablePermissions`.

Returns (on success):

- template permissions for organisation (using `is_system_org` to filter internal/external permissionNames)
  - id (permissionNameId)
  - name (to be used in the action to be granting the user's permission)
  - displayName (just the **name** field written with spaces)
  - description (new field)
  - isUserGranted (**true/false** - similar to what is in next two arrays)
  - TemplateCodes - Array with all templates linked to this permission
- granted permissions to user
  - Permissions names user **has** been granted permission
- available permissions for user
  - Permissions names user **hasn't** been granted permission

##### RESPONSE Body (example):

```JSON
{
    "templatePermissions":
    [
        {
            "id": 1,
            "name": "applyTestRego",
            "displayName": "Apply Test Rego",
            "description": "Permission for external user to apply for a Test template of user registration",
            "isUserGranted": true,
            "templateCodes": [ "UserRegistration" ]
        },
        {
            "id": 2,
            "name": "applyCompanyRegistration",
            "displayName": "Apply Company Registration",
            "description": "Permission for external user to apply for Company registration template",
            "isUserGranted": false,
            "templateCodes": [ "CompanyRegistration" ]
        }
    ],
   "grantedPermissions":
   [
      "applyTestRego"
   ],
   "availablePermissions":
   [
       "applyCompanyRegistration"
   ]
}
```

#### Check Triggers

GET: `/check-trigger?serial=<applicationSerial>`

This endpoint is used by the front-end application loader to ensure that ALL triggers associated with an application (i.e. review assignments, reviews, verifications) are not running before the application data is fetched. This is so any mutations that cause Actions to run are all finished before any subsequent data is re-fetched, so the front-end shows all the changes.

The front-end processes this data in the `useTriggers` hook.

##### RESPONSE Body:

```
{
    "status": "ready" | "processing" | "error",
    "errors": // only present if status: "error"
        [
            {
                "table": "application",
                "id": 236,
                "trigger": "ERROR"
            }
        ] 
}
```

#### Generate PDF

POST: `/generate-pdf`

Endpoint to generate PDF files based on a [Carbone template](https://carbone.io/api-reference.html).

**Parameters** (as body JSON):

- `fileId` -- uniqueId of the carbone template file (from the "file" table)
- `data` -- object containing all the data to be used for substitutions in the carbone template
- `userId` / `applicationSerial` / `templateId` -- not required, but will be added to the resulting "file" record of the generated document. Note: it is not recommended to add `templateId` to files generated for applications; it should be reserved for files directly associated with templates, such as carbone document templates.
- `subfolder` -- will save output file into a subfolder if `applicationSerial` is not supplied

The return object contains:

```
{ uniqueId, filename, filePath }
```

The internal function called by this endpoint is the same one run by the ["generateDoc" action](List-of-Action-plugins.md).

#### Data Views

GET: `/data-views`
POST: `/data-views/<dataViewCode>`
GET: `/data-views/<dataViewCode>/<itemId>`

For displaying custom data (e.g. Users, Products, Orgs). User's JWT determines what they are allowed to see, and data is returned accordingly.

Please see [Data View](Data-View.md) for more info.

There are also related filter-specific endpoints:

POST: `/data-views/<dataViewCode>/filterList/<column>`
POST: `/admin/generate-filter-data-fields/<table>`

See [Data View Filters](Data-View-Filters.md) for more info.


#### Preview Actions

POST: `/preview-actions`

Allows template actions for a particular application to be run without actually being triggered by the normal [trigger/action process](Triggers-and-Actions.md). Used by the "Preview Decision" UI for reviewers where they can see what outputs (correspondence/documents) will be sent to the applicant as a result of their decision, but without actually sending anything out.

In order to be preview-able, template actions must be specifically configured to respond to the "ON_PREVIEW" trigger. Usually, these will be done with [Aliased actions](List-of-Action-plugins.md#aliasing-existing-template-actions), which point to the "real" actions, but with some of their parameters overriden. For example, for previewing an email (sendNotification) action, we would preview it with the "sendEmail" parameter set to `false` so it will generate the email text but not actually send it out yet.

See examples in the core/demo templates for how to configure action previews.

##### REQUEST parameters:

- `applicationId`
- `reviewId` (one of either `applicationId` or `reviewId` must be provided)
- `applicationDataOverride` an object containing data to override the generated applicationData. For example, when simulating a decision, we would override the `reviewData.latestDecision.decision` field with the hypothetical decision value and then the action would be "previewed" as though that were the actual applicationData it uses.


##### RESPONSE Body (example):

```JSON
{
    "displayData": [
        {
            "type": "NOTIFICATION",
            "status": "SUCCESS",
            "displayString": "Congratulations, application S-UUR-0001 has been approved",
            "text": "## Your product registration license ...",
            "errorLog": null
        }
    ],
    "actionsOutput": [
        {
            "action": "sendNotification",
            "status": "SUCCESS",
            "output": {
                "notification": {
                    "id": 2,
                    "user_id": 9,
                    "application_id": 239,
                    "review_id": 3,
                    "email_recipients": "carl@msupply.foundation",
                    "subject": "Congratulations, application S-UUR-0001 has been approved",
                    "message": "## Your product registration license ...",
                    "attachments": [],
                    "email_sent": false,
                    "is_read": false
                }
            },
            "errorLog": null
        }
    ]
}
```

`displayData` is used by the front-end to present the Preview results in the UI. `actionsOutput` contains the raw output of each action that ran.



#### Extend application deadline

POST: `/extend-application`

Endpoint for extending a deadline associated with an application. Currently, the main use case is for extending an applicant deadline for responding to a request for changes (event code: `applicantDeadline`), but in theory could be used for extending other types of deadlines as well.

It works by finding an event in the `trigger_schedule` table with matching `applicationId` and `eventCode` and then extending the `time_scheduled` by the specified amount. It also simulates a trigger `ON_EXTEND` -- i.e. the Trigger/Action system will respond as though an `ON_EXTEND` trigger had been fired for that application. This can be used (like normal triggers) to perform Actions, as per the template_action configuration. In the case of deadlines, the main Action we'd normally run with the `ON_EXTEND` trigger is to reset the application outcome (`changeOutcome` action) from "EXPIRED" back to "PENDING". (Note: there is a automatic database trigger/function to update the status whenever "Outcome" changes, to keep it consistent and correct.)

##### REQUEST parameters:

- `applicationId`
- `eventCode` -- value in `trigger_schedule` to match. For applicant deadlines we are currently using the hard-coded value `applicantDeadline` to match in the front-end UI. This event code is also passed along with the "ON_EXTEND" trigger to use to match to actions. 
- `extensionTime` -- a length of time: either a number (which will be interpreted as days), or a [Luxon duration object](https://moment.github.io/luxon/api-docs/index.html#duration). If the current deadline has already expired, this extension time will be added to the current time. If it's not already expired, it'll be added to the current value of the `time_scheduled` field.
- `data` -- any additional data that will be passed along as part of the simulated trigger's `data` field

##### RESPONSE body (example):

```JSON
{
    "success": true,
    "newDeadline": "2027-07-19T22:18:04.992Z"
}
```

#### Lookup table endpoints

- GET: `/lookup-table/list` - get structure of all lookup tables
- GET: `/lookup-table/table/:id` - get structure of single table
- POST: `/lookup-table/import` - import a table (from CSV file)
- POST: `/lookup-table/import/:id` - update existing table (from CSV)
- GET: `/lookup-table/export` - download table (as CSV)

Require either "admin" or "systemManger" permissions.

See [Lookup table documentation](https://github.com/msupply-foundation/conforma-web-app/wiki/Lookup-Tables) for more info

#### Manage localisations

Require either "admin" or "systemManger" permissions.

Used by the front-end `/admin/localisations` page

POST: `/localisation/enable?code=<languageCode>&enabled=<true/false>`
- To enable or disable a language that is already installed. If parameter `enabled` is omitted, the current setting will be toggled.

POST: `/localisation/install`
- To install a a new language into the system.

GET: `/localisation/get-all`
- Fetches all languages in a single bundle. Used by the "Export as CSV" feature.

**Input parameters** (as body JSON) example:
```
{
    "language": {
        "languageName": "Portuguese",
        "description": "Portuguese translation",
        "code": "pt_br",
        "flag": "🇧🇷",
        "enabled": true
    },
    "strings": {
        "ACTION_ASSIGN": "Atribuir",
        "ACTION_CONTINUE": "Continuar"
        ...
    }
}
```

**Returns**:
```
{
    "success": true,
    "message": "Language installed: Portuguese / pt_br"
}
```

POST: `/localisation/remove?code=<languageCode>`
- uninstalls the language from the server

See [Localisation documentation](https://github.com/msupply-foundation/conforma-web-app/wiki/Localisation) for more info


#### External API access

POST: `/external-api/<name>/<route>`

A "relay" endpoint for querying third-party APIs that require authentication or other restrictions that we don't want the front-end to have access to.

See [External API Access](External-API-Access.md) for further detail.

---

### Admin only endpoints

These are all prefixed with `/api/admin/` e..g `http://localhost:8080/api/admin/updateRowPolicies`

They require a valid JWT with the `isAdmin` field set to `true` (which means user has "Admin" permissions)

#### Update row level policies

GET: `/updateRowPolicies`

End point to refresh row level policies. Will drop all previosly generated policies and re-create a new.
Should be called anytime these change:

- template_permissions
- permission_name
- permission_policy

see [Permission Docs](Database-Schema-Permission.md) for more details

##### RESPONSE Body:

A json array of new policies:

```JSON
[
    "CREATE POLICY \"view_pp1pn1\" ON \"application\" FOR SELECT USING (jwt_get_boolean('pp1pn1') = true and template_id = jwt_get_bigint('pp1pn1_templateId')) ",
    "CREATE POLICY \"view_pp1pn1tp1\" ON \"application\" FOR SELECT USING (jwt_get_boolean('pp1pn1tp1') = true and template_id = jwt_get_bigint('pp1pn1tp1_templateId')) ",
    "CREATE POLICY \"view_pp2pn2\" ON \"application\" FOR SELECT USING (jwt_get_boolean('pp2pn2') = true and user_id = jwt_get_bigint('userId') AND template_id = jwt_get_bigint('pp2pn2_templateId')) ",
    "CREATE POLICY \"view_pp2pn2tp2\" ON \"application\" FOR SELECT USING (jwt_get_boolean('pp2pn2tp2') = true and user_id = jwt_get_bigint('userId') AND template_id = jwt_get_bigint('pp2pn2tp2_templateId')) ",
    "CREATE POLICY \"view_pp3pn3\" ON \"application\" FOR SELECT USING (jwt_get_boolean('pp3pn3') = true and template_id = jwt_get_bigint('pp3pn3_templateId')) ",
    "CREATE POLICY \"view_pp3pn3tp3\" ON \"application\" FOR SELECT USING (jwt_get_boolean('pp3pn3tp3') = true and template_id = jwt_get_bigint('pp3pn3tp3_templateId')) "
]
```

#### Template Import/Export

`/template`

A range of endpoints for importing and exporting templates. See [Template Import/Export](./Template-Import_Export.md) for the details.

#### Run Action

POST: `/run-action`

End point to run [Actions](Triggers-and-Actions.md) in isolation. Returns the action's "Output" object.

**Note: this endpoint is intended as a dev tool only and shouldn't be called from the actual codebase.**

**Parameters** (as body JSON):

- `actionCode` -- code of the required action (e.g. "incrementStage")
- `applicationId` -- used to fetch `applicationData`, which is required by most actions. If omitted, `applicationData` will not be passed to action, which _may_ cause problems..
- `parameters` -- the input parameters of the specified action.

**Example**:

```
{
    "actionCode": "generateTextString",
    "applicationId": 4001,
    "parameters": {
        "pattern": "<?templateName>-<?productName>",
        "customFields": {
            "templateName": "applicationData.templateName",
            "productName": "applicationData.responses.Q20.text"
        }
    }
}
```

returns:

```
{
    "status": "SUCCESS",
    "error_log": "",
    "output": {
        "generatedText": "Test -- Review Process-Vitamin B"
    }
}
```

#### Snapshot endpoints

- GET: `/snapshot/list`
- POST: `/snapshot/take`
- POST: `/snapshot/use`
- POST: `/snapshot/upload`
- POST: `/snapshot/delete`

See [Snapshot documentation](Snapshots.md) for more info

#### Preference management endpoints

- GET: `/get-all-prefs`
- POST: `/set-prefs`

The difference between these and the [public `get-prefs` endpoint](#get-preferences-endpoint) is that these read and write both web app *and* server preferences, whereas the public `get-prefs` is just for the web app.

See [Preferences documentation](Preferences.md) for more info

#### Raw data access

- GET: `/raw-data/<dataTable>/<id>`

Normally, data table data is accessed from the front-end via [Data Views](Data-View.md). However, this data is structured and formatted for presentation. Occasionally, an Admin template may require access to the raw database data from a data table, so this endpoint provides such a mechanism.
