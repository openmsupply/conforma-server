/* 
TEMPLATE B - Organisation Registration
  - still a work in progress, but this will be the template for creating an
    application to register an organisation
*/
exports.queries = [
  `mutation {
    createTemplate(
      input: {
        template: {
          code: "OrgRego1"
          name: "Organisation Registration"
          isLinear: false
          status: AVAILABLE
          startMessage: "## You will need the following documents ready for upload:\\n- Proof of Company name\\n- Proof of company address\\n- Bank account statement"
          versionTimestamp: "NOW()"
          templateSectionsUsingId: {
            create: [
              {
                code: "S1"
                title: "Section 1 - Organisation Details"
                index: 0
                templateElementsUsingId: {
                  create: [
                    {
                      id: 2
                      code: "S1T1"
                      index: 0
                      title: "Intro Section 1"
                      elementTypePluginCode: "textInfo"
                      category: INFORMATION
                      parameters: {
                        title: "Company details"
                        text: "The details entered should match with your registered company documents attached."
                      }
                    }
                    {
                      code: "S1Q1"
                      index: 1
                      title: "Organisation Name"
                      elementTypePluginCode: "shortText"
                      category: QUESTION
                      validation: {
                        operator: "API"
                        children: [
                          "http://localhost:8080/check-unique"
                          ["type", "value"]
                          "organisation"
                          {
                            operator: "objectProperties"
                            children: ["responses.thisResponse"]
                          }
                          "unique"
                        ]
                      }
                      validationMessage: "An organisation with that name already exists"
                      parameters: { label: "What is your company name?" }
                    }
                    {
                      code: "S1Q2"
                      index: 2
                      title: "Organisation Activity"
                      elementTypePluginCode: "dropdownChoice"
                      category: QUESTION
                      parameters: {
                        label: "Select type of activity"
                        options: ["Manufacturer", "Importer", "Producer"]
                      }
                    }
                    {
                      code: "S1Q3"
                      index: 5
                      title: "Organisation national or international"
                      elementTypePluginCode: "dropdownChoice"
                      category: QUESTION
                      parameters: {
                        label: "Organisation Nationality"
                        description: "Select the nationality of this company:"
                        options: ["National", "International"]
                      }
                    }
                    {
                      code: "S1Q4"
                      index: 6
                      title: "Import permit upload"
                      elementTypePluginCode: "textInfo"
                      category: INFORMATION
                      visibilityCondition: {
                        operator: "="
                        children: [
                          {
                            operator: "objectProperties"
                            children: ["responses.S1Q3.text"]
                          }
                          "International"
                        ]
                      }
                      parameters: { label: "Upload your valid import permit" }
                      isRequired: false
                    }
                  ]
                }
              }
              {
                code: "S2"
                title: "Section 2"
                index: 1
                templateElementsUsingId: {
                  create: [
                    {
                      code: "S2T1"
                      index: 0
                      title: "Intro Section 2 - Page 1/2"
                      elementTypePluginCode: "textInfo"
                      category: INFORMATION
                      parameters: { title: "Company location" }
                      visibilityCondition: {
                        operator: "="
                        children: [
                          {
                            operator: "objectProperties"
                            children: ["responses.S1Q3.text"]
                          }
                          "National"
                        ]
                      }
                    }
                    {
                      code: "S2Q1"
                      index: 1
                      title: "Address"
                      elementTypePluginCode: "shortText"
                      category: QUESTION
                      parameters: {
                        label: "Enter the organisation street address"
                      }
                      visibilityCondition: {
                        operator: "="
                        children: [
                          {
                            operator: "objectProperties"
                            children: ["responses.S1Q3.text"]
                          }
                          "National"
                        ]
                      }
                    }
                    {
                      code: "S2Q2"
                      index: 2
                      title: "Organisation region"
                      elementTypePluginCode: "shortText"
                      category: QUESTION
                      parameters: { label: "Enter the company region" }
                      visibilityCondition: {
                        operator: "="
                        children: [
                          {
                            operator: "objectProperties"
                            children: ["responses.S1Q3.text"]
                          }
                          "National"
                        ]
                      }
                    }
                    {
                      code: "S2T2"
                      index: 4
                      title: "Intro Section 2 - Page 2/2"
                      elementTypePluginCode: "textInfo"
                      category: INFORMATION
                      parameters: { title: "Bank Details" }
                    }
                    {
                      code: "S2Q3"
                      index: 5
                      title: "Billing account"
                      elementTypePluginCode: "shortText"
                      category: QUESTION
                      parameters: { label: "Enter the company billing account" }
                    }
                    {
                      code: "S2Q4"
                      index: 4
                      title: "Name of account"
                      elementTypePluginCode: "shortText"
                      category: QUESTION
                      parameters: { label: "Enter the company acount name" }
                    }
                  ]
                }
              }
              {
                code: "S3"
                title: "Section 3"
                index: 2
                templateElementsUsingId: {
                  create: [
                    {
                      code: "S3T1"
                      index: 0
                      title: "Intro Section 1 - Page 1/1"
                      elementTypePluginCode: "textInfo"
                      category: INFORMATION
                      parameters: { title: "Company staff details" }
                    }
                    {
                      code: "S3Q1"
                      index: 1
                      title: "Organisation Size"
                      elementTypePluginCode: "dropdownChoice"
                      category: QUESTION
                      parameters: {
                        label: "What is the size of the organization"
                        options: ["Small", "Medium", "Large"]
                      }
                      isRequired: false
                    }
                  ]
                }
              }
            ]
          }
          templateStagesUsingId: {
            create: [
              {
                number: 1
                title: "Screening"
                description: "This application will go through the Screening stage before it can be accessed."
              }
              {
                number: 2
                title: "Assessment"
                description: "This phase is where your documents will be revised before the application can get the final approval."
              }
            ]
          }
          templateActionsUsingId: {
            create: [
              {
                actionCode: "incrementStage"
                trigger: ON_APPLICATION_CREATE
                parameterQueries: {
                  applicationId: {
                    operator: "objectProperties"
                    children: ["applicationData.record_id"]
                  }
                }
              }
              {
                actionCode: "cLog"
                trigger: ON_APPLICATION_SUBMIT
                parameterQueries: {
                  message: { value: "Company Registration submission" }
                }
              }
              {
                actionCode: "changeStatus"
                trigger: ON_APPLICATION_SUBMIT
                parameterQueries: {
                  applicationId: {
                    operator: "objectProperties"
                    children: ["applicationData.record_id"]
                  }
                  newStatus: { value: "Submitted" }
                }
              }
              # TO-DO: Create actions to add Org, etc.
            ]
          }
        }
      }
    ) {
      template {
        code
        name
      }
    }
  }`,
]
