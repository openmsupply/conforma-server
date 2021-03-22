/* 
TEMPLATE B2 - Join Organisation
  - Template to join an existing organisation
*/
const { coreActions } = require('./core_actions')

exports.queries = [
  `mutation {
    createTemplate(
      input: {
        template: {
          code: "OrgJoin"
          name: "Join Organisation"
          isLinear: false
          status: AVAILABLE
          startMessage: "## You will need the following documents ready for upload:\\n- PhotoID"
          versionTimestamp: "NOW()"
          templateSectionsUsingId: {
            create: [
              {
     
                code: "S1"
                title: "Personal Information"
                index: 0
                templateElementsUsingId: {
                  create: [
                    {
    
                      code: "S1T1"
                      index: 0
                      title: "Intro Section 1"
                      elementTypePluginCode: "textInfo"
                      category: INFORMATION
                      parameters: {
                        title: {
                          operator: "stringSubstitution"
                          children: [
                            "Welcome, %1."
                            {
                              operator: "objectProperties"
                              children: ["currentUser.firstName"]
                            }
                          ]
                        }
                      }
                    }
                    {
          
                      code: "S1Q1"
                      index: 1
                      title: "Select Organisation"
                      elementTypePluginCode: "dropdownChoice"
                      category: QUESTION
                      parameters: {
                        label: "Please select the organisation you wish to join"
                        options: [ "Demo organisation", "Medicinal Importers, Ltd.", "Lab Facilities Inc." ]
                      }
                    }
                    {
                      id: 5002
                      code: "S1Q2"
                      index: 2
                      title: "Reason"
                      elementTypePluginCode: "shortText"
                      category: QUESTION
                      parameters: {
                        label: "Reason for joining"
                        description: "Please provide a brief summary of your relationship to this organisaion"
                      }
                    }
                    {
     
                      code: "PB01"
                      index: 3
                      title: "Page Break"
                      elementTypePluginCode: "pageBreak"
                      category: INFORMATION
                    }
                    {
                   
                      code: "T2"
                      index: 4
                      title: "Documentation Info"
                      elementTypePluginCode: "textInfo"
                      category: INFORMATION
                      parameters: { title: "Documentation" }
                    }
                    {
                
                      code: "IDUpload"
                      index: 5
                      title: "Upload ID"
                      elementTypePluginCode: "fileUpload"
                      category: QUESTION
                      parameters: {
                        label: "Please provide photo ID"
                        description: "Please upload a copy of your photo ID. Must be in **image** or **PDF** format and under 5MB."
                        fileCountLimit: 1
                        fileExtensions: ["pdf", "png", "jpg", "jpeg"]
                        fileSizeLimit: 5000
                      }
                    }
                    {
                  
                      code: "DocUpload"
                      index: 6
                      title: "Upload Doc"
                      elementTypePluginCode: "fileUpload"
                      category: QUESTION
                      isRequired: false
                      parameters: {
                        label: "Please upload additional documentation"
                        description: "If necessary, please provide additional documentation showing your relationship to this organisation.\\nYou can upload more than one file if necessary, with same restrictions as above."
                        fileCountLimit: 5
                        fileExtensions: ["pdf", "png", "jpg", "jpeg"]
                        fileSizeLimit: 5000
                      }
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
                title: "Approval"
                description: "This application will be approved by a Reviewer"
              }
            ]
          }
          templateActionsUsingId: {
            create: [
              ${coreActions}
              {
                actionCode: "cLog"
                trigger: ON_APPLICATION_SUBMIT
                parameterQueries: {
                  message: { value: "Company Registration submission" }
                }
              }
              {
                actionCode: "cLog"
                trigger: ON_REVIEW_SUBMIT
                sequence: 10
                parameterQueries: {
                  message: { value: "Trying to join user to org..." }
                }
              }
              {
                actionCode: "joinUserOrg"
                trigger: ON_REVIEW_SUBMIT
                sequence: 11    
                condition: {
                  operator: "AND"
                  children: [
                    {
                      operator: "="
                      children: [
                        {
                          operator: "objectProperties"
                          children: [
                            "applicationData.reviewData.latestDecision.decision"
                          ]
                        }
                        "CONFORM"
                      ]
                    }
                    {
                      operator: "objectProperties"
                      children: ["applicationData.reviewData.isLastLevel"]
                    }
                  ]
                }       
                parameterQueries: {
                  user_id: {
                    operator: "objectProperties"
                    children: ["applicationData.userId"]
                  }
                  org_id: {
                    type: "number"
                    operator: "pgSQL"
                    children: [
                      "SELECT id FROM organisation WHERE like %$1%"
                      {
                        operator: "objectProperties"
                        children: ["responses.S1Q1.text"]
                      }
                    ]
                  }
                }
                
              }
              {
                actionCode: "grantPermissions"
                trigger: ON_REVIEW_SUBMIT
                sequence: 103
                condition: {
                  operator: "AND"
                  children: [
                    {
                      operator: "="
                      children: [
                        {
                          operator: "objectProperties"
                          children: [
                            "applicationData.reviewData.latestDecision.decision"
                          ]
                        }
                        "CONFORM"
                      ]
                    }
                    {
                      operator: "objectProperties"
                      children: ["applicationData.reviewData.isLastLevel"]
                    }
                  ]
                }
                parameterQueries: {
                  username: {
                    operator: "objectProperties"
                    children: ["applicationData.username"]
                  }
                  permissionNames: ["canApplyDrugRego"]
                }
              }
              
            ]
          }
          templatePermissionsUsingId: {
            create: [
              { permissionNameId: 50 }
              { permissionNameId: 51, level: 1, stageNumber: 1, restrictions: { canSelfAssign: true } }
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
