## Contents  <!-- omit in toc -->
<!-- toc -->
- [API](#api)
  - [`/data-views` (GET)](#data-views-get)
  - [`/data-views/<dataViewCode>?<queries>` (POST)](#data-viewsdataviewcodequeries-post)
  - [`/data-views/<dataViewCode>/<itemId>` (GET)](#data-viewsdataviewcodeitemid-get)
- [Configuration](#configuration)
  - [`data_view` table](#data_view-table)
  - [`data_view_column_definition` table](#data_view_column_definition-table)
  - [Additional formatting](#additional-formatting)
  - [A note about Array data](#a-note-about-array-data)
- [Real use-case example](#real-use-case-example)
- [Lookup tables](#lookup-tables)
<!-- tocstop -->

Display of (custom) **Data** tables (e.g. Products, Users, Orgs) (or any table, strictly speaking) can be configured for viewing in the UI by setting entries in the `data_view` and `data_view_column_definition` database tables. This allows us to set:

- who is allowed to see them
- what columns to show different types of user
- "special" columns, which show the result of an [evaluator](Query-Syntax.md) expression, so can show some fields combined, or queries to another table, for example
- how columns should be formatted in the UI
- how filters and sorting should work for each table field (explained separately in [Data View Filtering](Data-View-Filters.md))

The data is served to the front-end via the `/data-views` API end-points, and serves data based on the request's JWT header, so we can ensure that no user can receive data that they haven't been configured to be allowed to see.

The database's row-level permissions ensure that only allowed rows are returned to the user, and the logic in the "dataViews" code returns allowed columns. We also support custom "rowRestrictions" for limiting the individual records a given user is allowed to see (see below).

Configuration of the data views can be done in the UI by an Admin, using url `/admin-data-views`

## API

Custom data is available at the following endpoints:

### `/data-views` (GET)

Returns an array of data table views the user is allowed to see (based on JWT header), formatted as follows:

```
[
    {
        "tableName": "user",
        "title": "Users (Restricted View)",
        "code": "userRestricted",
        "urlSlug":"user-restricted",
        "defaultFilter" "isActive=true"
    },
    ...etc.
]
```

This endpoint is called in order to populate the Database menu in the UI.

### `/data-views/<dataViewCode>?<queries>` (POST)

For querying a specific table. Data is returned in the following structure:

```js
{
    "tableName": "user",
    "title": "Users (Restricted View)",
    "code": "userRestricted",
    "headerRow": [
        {
            "columnName": "firstName",
            "title": "First Name",
            "isBasicField": true,
            "dataType": "string",
            "formatting": {}
        },
        {
            "columnName": "lastName",
            "title": "Last Name",
            "isBasicField": true,
            "dataType": "string",
            "formatting": {}
        },
        ...etc.
    ],
    "tableRows": [
        {
            "id": 9,
            "rowValues": [
                "Jane",
                "Smith",
                "jane_smith",
                "jj@nowhere.com"
            ],
            "item": {
                "firstName": "Jane",
                "lastName": "Smith",
                "username": "jane_smith",
                "email": "jj@nowhere.com""
            }
        },
        ...etc.
    ],
    "searchFields": ["firstName", "lastName"],
    "filterDefinitions": ... // See Data View Filters page
    "totalCount": 13
}
```

Note that each table row is returned as both an array of values *and* a single "item" object with key-value pairs, so you can query the resulting rows by index or by key, whichever is more appropriate.

`totalCount` is used for pagination purposes (since only one page of data is returned at a time)

#### Query parameters

Query parameters are (currently) as follows:

- `first` -- number of records to return (default: 20)
- `offset` -- start from record number (default: 0) (used in conjunction with `first` to control pagination)
- `order-by` -- field to sort by (default: `id`),
- `ascending` -- whether to sort ascending or descending (default: `true`)
- `raw` -- set to `true` and the table data will be returned as just a single array of objects, i.e. no column or data definitions. This is useful when making queries to a table in an application form (e.g. a list of countries in a drop-down) -- you just want simple access to the data, not its display definitions.

##### Filter / search
Additional filtering is primarily done via JSON in the request body. The JSON object is a GraphQL filter object. However, an additional `search` query parameter can be provided, which will be converted to and merged with the Filter JSON (the `search` parameter adds a filter for the `table_search_columns` that are [defined](#data_view-table)).

### `/data-views/<dataViewCode>/<itemId>` (GET)

Fetches data about a single item, for display in data "Details" view. Data is returned in the following format:

```
{
    "tableName": "user",
    "tableTitle": "Users (Restricted View)",
    "id": 9,
    "header": {
        "value": "Jane Smith",
        "columnName": "fullName",
        "isBasicField": false,
        "formatting": {}
    },
    "columns": [
        "username",
        "email",
        "dateOfBirth",
        "orgs"
    ],
    "displayDefinitions": {
        "username": {
            "title": "Username",
            "isBasicField": true,
            "dataType": "string",
            "formatting": {
                "substitution": "_${}_"
            }
        },
        "email": {
            "title": "Email",
            "isBasicField": true,
            "dataType": "string",
            "formatting": {}
        },
        "dateOfBirth": {
            "title": "Date Of Birth",
            "isBasicField": true,
            "dataType": "Date",
            "formatting": {}
        },
        "orgs": {
            "title": "Member of",
            "isBasicField": false,
            "formatting": {
                "substitution": "[${organisation.name}](/outcomes/organisation/${organisation.id})"
            }
        }
    },
    "item": {
        "username": "jane_smith",
        "email": "jessica@msupply.foundation",
        "dateOfBirth": null,
        "orgs": [
            {
                "organisation": {
                    "name": "Pharma123",
                    "id": 2
                }
            },
            {
                "organisation": {
                    "name": "Manufacturer Medical",
                    "id": 3
                }
            },
            ...etc.
        ]
    },
    "linkedApplications": [
        {
            "id": 25,
            "name": "User Registration - UR-ZLQ-0102",
            "serial": "UR-ZLQ-0102",
            "templateName": "User Registration",
            "templateCode": "UserRegistration",
            "dateCompleted": "2021-09-07T07:08:42.590371+12:00"
        }
    ]
}
```

Note the different types of data returned and the formatting instructions. Also, the "orgs" field has a complex value and is not just a simple field from the "user" table (hence `isBasicField: false`). More on this below.

As with the [Table](#data-viewsdataviewcodequeries-post) request, the query parameter `raw=true` can be added and the returned value will just contain the single data entity with no display definitions.

## Configuration

### `data_view` table

In order to make outcome data available to the front-end, the minimal configuration requirements are a single entry in the `data_view` table with the following fields provided:

- `table_name` -- name of the table we are displaying
- `code` -- to match the particular "view", and what is shown the in the front-end URL. It's possible to have multiple views with the same code, but only one will be shown to a given user, based on their permissions, and the `priority` value (see below). You can create multiple views with different codes per `table_name`, for example you might have a `usersExt` view and a `usersInt` view for the 'user' table.
- `identifier` -- this must be a *unique* value which should describe the specific data view. It is used in the front-end configuration UI to list the available views, so must be able to discriminate between multiple views with the same `code` for the same table. E.g. "External Users (Staff view)", "External Users (own company)". It cannot be `null`, but a default value with random suffix is generated when creating a new view in the UI.

And with that, the "table_name" table will show up in the Database menu, and it will show all fields to everyone in both Table and Details view.

However, we normally want to not show every field, and not to every user, so further specifications would normally be required.

Different configurations of fields and who can see them can be set up for each table, so for convenience, we are calling a single configuration a "layout"

The following fields are also configurable in "data_view" layouts:

- `title`: the name of the "view" that shows in the "Database" menu and as the Header of the table (e.g. "Users"). Default is just the tableName converted to plural Title Case, e.g. `user` => "Users"
- `permissionNames`: an array of permissions names that the request requires (via JWT) in order to see this Layout. Default is an empty array, and both that and `null` allow full access (i.e. no restrictions)
- `rowRestrictions`: A json-formatted GraphQL filter to restrict the records that are returned. The filter can take substitutions as per the [Additional Formatting](#additional-formatting) substitutions below. For example, we could limit the "users" table to only users who belong to the organisation the current user is logged in with.
- `table_view_include_columns`: an array of fields to return for the "table" endpoint. Should be field names written in camelCase. All values should match with either the name of a field in the table being queried, or the name of a "custom" column defined in `data_display_column_definition` (see below).  
Some things to be aware of:
  - `null` or empty array means return ALL fields
  - if you've named a "custom" field in here and yet still want to return all other fields, you can specify this by including the special value "..." as an item, which has the same effect as the "...rest" parameter in javascript.
- `table_view_exclude_columns`: an array of columns to exclude. Basically, it takes all the columns collected from the "include" list, and removes any named here.
- `detail_view_include_columns` / `detail_view_exclude_columns`: exactly the same as the "table_view" fields, except applies to the fields that show up in the Details view
- `raw_data_include_columns` / `raw_data_exclude_columns`: same as the `table_view` column inclusion/exclusions, except these are the columns returned when the `raw=true` parameter is set. These can be left `null`, in which case the `table_view` columns will be returned.
- `detail_view_header_column`: name of the field/column whose value should be used as the Header display in Details view. If not specified, the table name will just be used.
- `default_sort_column`: the column that the table data will be ordered by when no column-sort is selected in the front-end. You should rarely need to set this -- the default is `id`, which usually corresponds to the order in which items were added, so is fine for most purposes. However, if you need to override it with a different column, this allows it. It will be sorted *ascending* by default -- if you want to change this to *descending*, append "_DESC" to the column, e.g. `timestamp_DESC`
- `show_linked_applications`: if `true`, the `/item` endpoint will also return an array of linked applications connected to this particular item. These are taken from the outcome "join" tables, whose records are created on successful application approvals.
- `priority`: when multiple views match the `code` (i.e. user has permissions for more than one), the view with the highest priority will be returned the to the user. A typical use case for this would be if you have a particular view that is open to all users (i.e `permissionNames` is `null`), but you want users with certain permissions to see a different view for the same request (e.g Staff might be able to see *all* users, whereas external users can only see those in their own organisation). Default value: `1`.
- `default_filter_string`: a string that will be appended to the url of the data view in the front-end in order to implement the default filtering for the view (see [Data View Filters](Data-View-Filters.md)). You can work out what the string should be by setting the filters (in the front-end) and just copying the url query string. For example, a default filter for a product table might want to restrict the initial view to active (non-cancelled) products from Australia, so the `default_filter_string` would be something like `is-active=true&registered-in=Australia`
- `menu_name`: The name that appears in the front-end "Database" menu. Normally this would be the exact same thing as `title`, but might be useful if you want an abbreviated name for a long title in the menu. Also, if set to `null`, it won't appear in the "Database" menu at all. This is how lookup tables are hidden by default (so as to avoid cluttering the Database menu with loads of lookup tables that can be accessed another way).
- `submenu`: If specified, the view will appear in a sub-menu in the front-end menu bar. This provides a way to keep data views organised and group related ones together, if desired. If not specified, the view will show in the root "Database" menu.
- `enabled`: Whether or not the data view is active (i.e. visible in the UI). It can be useful to pre-configure a data view for a certain table before any data has actually been created for that table, and so it doesn't exist yet. In this case, set `enabled` to false so the view won't show in the menu and display an error state when viewed. Note -- whenever a new table is created in the database any existing data views are automatically enabled.

(We also have fields `filter_include_columns`, `filter_exclude_columns`, `table_search_columns` but they are explained in [Data View Filters](Data-View-Filters.md))

Okay, so if you're just wanting to display fields directly taken from the outcome table in question, and the formatting requirements are all "simple" types (text, number, boolean, Date) the `data_view` table is all you need. However, if you want to return columns with more complex data (such as a list of ingredients, or a query to another table) or require non-default formatting, you'll need to define these in the `data_view_column_definition` table.

### `data_view_column_definition` table

As mentioned, this table is for defining how to return columns with specifications beyond that which can be defined in the `data_view` table.

The input fields are as follows:

- `table_name` (as above)
- `column_name`: must match with one of the column names specified in the inclusion lists above.
- `title`: title to show for the field name. If not specified, it will just be the column_name in "Start Case".
- `element_type_plugin_code`: if the value being returned is a whole application response, then it will be parsed and displayed using a front-end element plugin (SummaryView). This is where you specify the code of the plugin required. If `null`, value won't be sent to a SummaryView element for display.
- `element_parameters`: if a plugin is specified above, then it will require input parameters. This value should be an object containing all the parameters required for display. Values of parameters can be literals or evaluator queries, and will be evaluated by the front-end in SummaryView just like a normal form element.
- `additional_formatting`: a custom object specifying additional formatting definitions. Detailed explanation below.
- `value_expression`: if `null`, the returned value will just be the value of the field from the table in question. However, if you are defining a custom column, or you want to over-ride the value of the field, this field should contain an evaluator expression. The "object" passed into the evaluator for "objectProperties" operator is the current record (item) represented as key-value pairs. 
   - For example, if you wanted to return a custom field from the "user" table that combined both first and last names (column name: `fullName`), your `value_expression` query would be:  
```
{
  "operator": "stringSubstitution",
  "children": [
    "%1 %2",
    {
      "operator": "objectProperties",
      "children": ["firstName"]
    },
    {
      "operator": "objectProperties",
      "children": [ "lastName"]
    }
  ]
}
```  
`firstName` and `lastName` are native fields on the "user" table, and are at the root level of the passed-in object here. Note that this object contains *all* fields, not just the ones being returned, so you can extract values from fields not being returned, such as in this case (where you wouldn't want to return `firstName` and `lastName` fields as well as a `fullName` column.)
- `hideIfNull`: if `true`, then this field will be hidden completely when its value is `null`. This only affects the single-item "Details" view, which displays each value in its own row.

(Again, columns relating to sorting or filtering (`sort_column`, `filter_parameters`, `filter_expression`, `filter_data_type`) are explained in [Data View Filters](Data-View-Filters.md))

### Additional formatting

The additional formatting field is intended to be an extensible field, where we can add new "custom formatting" definitions as required. Currently, the following properties are supported:

- `dateFormat`: Out of the box, if the returned value is a Date type, then it will be displayed in a nice "short date" format (DD/MM/YY) (locale-dependent). However, if you want a different date format, the value here should either be one of the Luxon date/time presets (see [here](https://moment.github.io/luxon/#/formatting?id=presets)) or a whole Luxon date format object.
- `substitution`: A string value with `${<property>}` substitution parameters, the same technique used by the "listBuilder" and "search" plugins for displaying complex input data. If the value returned by the column this applies to is an object, then `<property>` refers to a property of that object.  
For example, if the returned value was `{name: "John", age: 35}` and you wanted to display it with the name in bold and the age after it in brackets, the substitution string value would be:  
  `**${name}** (${age})`
All fields are interpreted as Markdown by the front end, so this would display as: **John** (35).  
Named properties on an object can be deeply nested, e.g. `user.firstName`

  If the returned value is *not* an object, we can substitute the whole value into the substitution string using `${}` (i.e. empty parameter) e.g. to display any simple column's value in italics, we'd just add the substitution string `*${}*`

  Note: the same result could be achieved using a complex evaluator query in the `value_expression` field, but this is just a simpler (and hopefully more readable) way to do basic substitutions.

### A note about Array data

If a column value is an array, then the array will be interpreted as a Markdown list, and all formatting options (plugin type, additional formatting, etc) will be applied to *each item* in the list. See below for an example.

## Real use-case example

Here is a `data_view` entry for showing Organisations:

```
{
    "id": 3,
    "tableName": "organisation",
    "code": "organisation",
    "title": "Organisations",
    "permissionNames": null,
    "tableViewIncludeColumns": [
        "logoUrl",
        "name",
        "address"
        ],
    "tableViewExcludeColumns": null,
    "detailViewIncludeColumns": [
        "logoUrl",
        "...",
        "members"
        ],
    "detailViewExcludeColumns": [
        "id",
        "name",
        "isSystemOrg"
        ],
    "detailViewHeaderColumn": "name",
    "showLinkedApplications": true,
    "priority": 1
}
```

This layout describe how to display the `organisation` table. It will have the title "Organisations" (when in Table view).

- `permissionNames` is `null`, so all users will see this layout
- Table view will show the three named columns
- Details view, however, is a little more complex
  - `...` shows all columns. The reason why we include it *after* `logoUrl` is because we want the logo to appear first in the Detail table.
  - the column name `members` is not a field on the `organisation` table. This means we will expect it to have a custom definition in the `outcome_display_column_definition` table.
  - we exclude `id`, `name` and `isSystemOrg`, so the complete list of fields that will be shown in Details view is (in order):
    - logoUrl
    - registration
    - address
    - registration_documentation
    - members (custom column)
- In Details view, the page Header will be the value from the `name` field (which is why it made sense to exclude it from the list of fields to show)
- We also are allowed to see a list of Linked Applications in Details view

We now define three columns with custom definitions in `data_view_column_definition`: `logoUrl`, `registrationDocumentation` and `members`. That means that the other two will just use their field name as column title, and the values in those fields will be shown as plain text.

Let's look at the custom column definitions one by one (from `data_view_column_definition`):

**logoUrl**

```
{
    "id": 6,
    "tableName": "organisation",
    "columnName": "logoUrl",
    "title": "Logo",
    "elementTypePluginCode": "imageDisplay",
    "elementParameters": {
    "url": {
        "children": [
        {
            "children": [
            "applicationData.config.serverREST"
            ],
            "operator": "objectProperties"
        },
        {
            "children": [
            "responses.thisResponse"
            ],
            "operator": "objectProperties"
        }
        ],
        "operator": "+"
    },
    "size": "tiny",
    "altText": "No logo supplied"
    },
    "additionalFormatting": null,
    "valueExpression": {}
}
```
- It will displayed using the "imageDisplay" plugin
- The `elementParameters` define the url for the logo, namely: a combination of the server host and the value from the current response (the response object being the "value" returned in the `logoUrl` field, which is just a text path to the file).
- No "additionalFormatting" -- it's all handled by the "imageDisplay" plugin
- No "valueExpression" -- we just want the data straight from the `logoUrl` field

**registrationDocumentation**

```
{
    "id": 8,
    "tableName": "organisation",
    "columnName": "registrationDocumentation",
    "title": "Registration docs",
    "elementTypePluginCode": "fileUpload",
    "elementParameters": {},
    "additionalFormatting": null,
    "valueExpression": null
}
```
Pretty straightforward, it just uses the "fileUpload" plugin to display, and the value in this field is the whole response object required for the file display.

**members**

```
{
    "id": 10,
    "tableName": "organisation",
    "columnName": "members",
    "title": "Members",
    "elementTypePluginCode": null,
    "elementParameters": null,
    "additionalFormatting": {
        "substitution": "[${user.firstName} ${user.lastName}](/outcomes/user/${user.id})"
        },
    "valueExpression": {
        "operator": "graphQL",
        "children": [
            "query getOrgUsers($id:Int!) { userOrganisations(filter: 
                {organisationId: {equalTo: $id}}) { nodes { user 
                { id, firstName, lastName }}}}",
            "graphQLEndpoint",
            ["id"],
            {
                "operator": "objectProperties"
                "children": ["id"],
            },
            "userOrganisations"
            ] 
        }
}
```
This is the most sophisticated display field -- it shows a clickable list of users who belong to this organisation. The key definitions here are:
- `valueExpression` defines a GraphQL query to fetch users via their "userOrganisation" link
- `additionalFormatting` -- It's not clear here, but the above query returns an *array* of users, which (as mentioned above) will be formatted as a Markdown list by the front-end, so all our formatting definitions apply to each item (i.e. "user") in the array. So this `substitution` string is showing the full name of the user, formatted as a (Markdown) hyperlink, which links to a url showing the Detail view of this user.

All up, these definitions will be interpreted by the front-end and displayed in a Table view that looks like this:

![Table View](images/data-view-table-view.png)

And a Details view like this:

![Details View](images/data-view-detail-view.png)

## Lookup tables

By default, when viewing individual lookup tables in `/admin/lookup-tables` the user sees a basic plain-text table view of the data. This is fine for simple tables with only a few rows ("Dosage forms" for example), but if you have a table with thousands of entries (e.g. ingredients list), this will be quite cumbersome to view, with no pagination or filtering available.

Therefore, we've made it possible to take advantage of the data view configurations to view lookup table data. In order to achieve that, you need to enter a value in the `data_view_code` field of the `data_table` table (where overall info about all lookup and data tables is stored). If `data_view_code` is specified, the data will be displayed with that data view. If not, the default plain table will be used.

You'll probably want to *not* show lookup table views in the "Database" menu though, since they've been imported as lookup tables and would generally be viewed and configured in the `/lookup-tables` area. In order to achieve this, simply add the special "dummy" permission name "**lookupTables**" to the `permission_names` field of the `data_view` table. This will ensure the view is not returned in the list of available views in the Database table, but will be returned when viewing the table in `/lookup-tables` (assuming you have `isAdmin` permission, which is required to access the lookup table routes).

Note that you *can* show lookup table views in the Database menu (and therefore make them available to more people) if you add regular permission names to the `permission_names` array, just as you normally would.