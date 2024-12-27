**Templates** can be exported and imported into the system by an Admin user via the page accessible from Configuration -> Templates/Procedures`.

Templates can be edited in the **Template Builder**, but, in order to export them, they must be *committed*. This means they are allocated a unique **version_id** and can no longer be edited. This ensures that when you see two templates with the same version ID on different systems you can be confident that they are identical and have not undergone further modification.

Well, almost.

Templates have their own entities that are exclusive to them, such as form elements, actions, stages, etc. However, there are other entities that are not exclusive to a specific template and may be used by any number of templates. These are:

- [Data Views](./Data-View.md)
- [Lookup tables](./API.md#lookup-table-endpoints)
- Template Category
- Dashboard Filters
- Permissions
- Files

The problem is that, even though a template may be "committed", the above entities can still be subsequently modified, which can break the expected behaviour of a template, and has been a regular source of configuration bugs.

So the template export and import functionality has been designed to minimize these kind of problems.

## Checksums

First of all, records for the `permission_name`, `data_view` `data_view_column_definition`, `data_table`, `template_category`, `filter` and `file` tables have a `checksum` field, which is a SHA-256 hash of the full record. These are automatically updated by database triggers whenever these records are inserted or updated. Lookup tables have a checksum for the whole table at once (not outcome tables, as these are expected to regularly change).

This checksum is used as a comparison to determine if these records have changed compared with what is stored with exported templates.

## Linked entity data

There is an additional field on the `template` table called `linked_entity_data`. Whenever a template is committed, we store all the data for all the above associated entities, along with their current checksums, in a large JSON object in this field. This data is then exported along with the template as part of the export process. This way templates can be committed with a "snapshot" of the state of all their connected entities were in at that time. 

Then, when a template is imported into a system, if those linked entities already exist prior, the imported checksums are compared against the current system checksums. If they differ, UI is able to present the differences for each one, and the user can select whether to keep the version already in the system, or overwrite it with the incoming imported version.

## Endpoints for import/export

The [API](./API.md) provides a number of endpoints which the front-end uses when importing and exporting templates. As well as the raw import/export operations, there are a number of "helper" processes to check and inform the user.

All endpoints are prefixed with `/admin/template`, and require full Admin permission to access

The specific endpoints are:

- GET: `/check/<templateId>`  
  Called before **committing**, **exporting** or **duplicating** a template. It provides information about the requested template, including a full diff between the linked entities saved with the template (`linked_entity_data`) and the current state of the system. It can also inform if there are any data views that are used in the application form that are not properly linked to the template (via the `template_data_view_join` table). If committing, the user can then elect to rectify this situation first, or, if exporting, can opt to create a new version of the template with updated linked entity data.

- POST: `/commit/<templateId>`  
  Commits the template. As explained above, this generates a version ID, and collects the current linked entity data and checksums into the `linked_entity_data` field.

- GET: `/export/<templateId>`  
  Exports the template and returns a .zip file. The zip package consists of:
  - `template.json`: A single JSON object containing the entire template structure, without any database sequential IDs. The linked entities are all under a `shared` branch of the root structure.
  - `info.json`: Metadata recording the export timestamp, and the version of the Conforma system it was exported from (you can't re-import a template into a system running an older version of Conforma)
  - `/files/`: Any files linked to the template (e.g. Carbone template docs)

- POST: `/duplicate/version/<templateId>`  
  Creates a new version of the template on the system. Internally it basically just runs and export and re-import. A new version has the same template code, but the version ID is set to "*" to indicate it is not yet committed and can be edited. The `parent_version_id` field of the new is set to the version ID of the original template -- this allows us to keep track of the entire template version history.

- POST: `/duplicate/new/<templateId>`  
  Duplicates the template, but it gets a new `code` and a fresh version history (no parent). This is for creating an entirely new type of template rather than a new version of an existing one. The new template `code` is supplied as a parameter in the request Body JSON.

- POST: `/import/upload`  
  The first step in importing a template. A zip file is uploaded (as form data), it is analysed and its linked entities are compared with those in the current system. The response consists of:
  - `uid`: A random string used to identify the upload in the following `/install` step
  - `modifiedEntities`: Full diff between the uploaded entities and the current system
  - `ready`: Boolean -- `true` indicates no difference in the above, therefore no further action is required from the front-end user

- GET: `/import/get-full-entity-diff/<uid>`  
  If there are differences returned from the previous `/upload` step, the front-end presents the user with the diff data. However, the user may wish to see the *full* record data for the entities that differ. This endpoint fetches that data. (The front-end provides a UI to toggle between the full data and just the diff.) The `uid` refers to the random `uid` returned by the `/upload` endpoint.

- POST: `/import/install/<uid>`  
  Request the server to actually install the template previously uploaded. In the request Body JSON, a structure can be provided which tells the server whether to use the imported entity or use the current system entity for each linked entity that differs. On successful install, the following information about the newly installed is returned:
  ```
  {
    newTemplateId: number; // sequential database ID
    code: string;
    versionId: string;
    versionNo: number;
    status: template_status | null;
  }
  ```

- GET: `/get-data-view-details/<templateId>`  
  Returns a list of *all* data views in the system, with additional info regarding how each relates to the template in question. Namely:
  - `inTemplateElements`: whether or not this data view is referred to by any template elements (form elements)
  - `inOutputTables`: whether or not this data view is for a table that is referred to in a [`modifyRecord` action](./List-of-Action-plugins.md#modify-record). If a template outputs data to a certain data table, then it's likely that data views for it should be exported along with the template.
  - `applicantAccessible`: whether or not the data view is accessible by a user with the same permissions as that required to "apply" for this template. A helpful indicator, as a form element shouldn't be referring to a data view that the applicant can't see.
  These three properties are used in the "Data Views" section of the Template Builder "General" tab in order to help connect the correct data views to the template. To be clear, these properties are just *indicators*, but only data views that are properly linked to the template (via `template_data_view_join` table) will be exported with the template. The Data View connection UI provides a mechanism to do this, and these indicators assist the process.

- GET: `/get-linked-files/<templateId>'`  
  Returns a list of files associated with this template. Similar to the `get-data-view-details`, it provides information about which files are currently linked to the template (via `template_file_join` table) and which ones are (probably) used in a `generateDoc` action (as this is the primary use for files linked to templates). Again, this allows the user to properly link files used by the template, as well as un-link ones that are no longer required. If a used file is actually *missing* from the database, the user will be presented with a significant warning and won't be able to export the template until the problem is rectified.  
  The front-end also provides UI to upload a new file to associate with the template.

  ## Understanding the codebase

  All code associated with template import/export can be found in `/src/components/template-import-export`. At the top level is `routes.ts`, which provides all the above endpoints. Each endpoint references a function in the `/operations` subfolder (e.g. "check", "import", "export", etc.), and each of them in turn uses a number of helper methods (in `/utilities`) to perform tasks such as generating the diffs, or finding associated data views or files. The database layer methods are provided by `databaseMethods.ts`, and utilise global PostGres types auto-generated directly from the database using [`pg-to-ts`](https://github.com/danvk/pg-to-ts) (in `/generated/postgres.ts`).

  See in-code comments for more specifics about various details.