import { ActionQueueStatus } from '../../../src/generated/graphql'
import { ActionPluginType } from '../../types'
import databaseMethods from './databaseMethods'
import path from 'path'
import nodemailer, { SentMessageInfo } from 'nodemailer'
import marked from 'marked'
import configTest from '../configTest.json'
import { Attachment } from 'nodemailer/lib/mailer'
import { getFilePath } from '../../../src/components/files/fileHandler'
import { ActionApplicationData } from '../../../src/types'
import config from '../../../src/config'
import { errorMessage, getEnvVariableReplacement } from '../../../src/components/utilityFunctions'

const isValidEmail = (email: string) => /^[\w\-_+.]+@([\w\-]+\.)+[A-Za-z]{2,}$/gm.test(email)
// Test this regex: https://regex101.com/r/ysGgNx/2

const sendNotification: ActionPluginType = async ({ parameters, applicationData, DBConnect }) => {
  const db = databaseMethods(DBConnect)

  const {
    environmentData: { appRootFolder, filesFolder, SMTPConfig, emailMode },
    other,
  } = applicationData as ActionApplicationData

  const testingEmail = config.testingEmail

  const {
    userId,
    email,
    to = email,
    cc,
    bcc,
    fromName = SMTPConfig?.defaultFromName,
    fromEmail = SMTPConfig?.defaultFromEmail,
    subject,
    message,
    attachments = [],
    sendEmail = true,
  } = parameters

  const transporter = SMTPConfig
    ? nodemailer.createTransport(
        emailMode === 'MAILHOG'
          ? configTest
          : {
              host: SMTPConfig.host,
              port: SMTPConfig.port,
              secure: SMTPConfig.secure,
              auth: {
                user: SMTPConfig.user,
                pass: getEnvVariableReplacement(SMTPConfig.password),
              },
            }
      )
    : null

  try {
    const toAddresses = validateEmailRecipientsList(to)
    const ccAddresses = validateEmailRecipientsList(cc)
    const bccAddresses = validateEmailRecipientsList(bcc)

    const hasValidEmails = !(
      toAddresses.length === 0 &&
      ccAddresses.length === 0 &&
      bccAddresses.length === 0
    )

    // Create notification database record
    console.log('Creating notification...')
    const notificationResult = await db.createNotification({
      userId,
      applicationId: applicationData?.applicationId,
      reviewId: applicationData?.reviewData?.reviewId,
      emailAddressString: concatEmails(toAddresses, ccAddresses, bccAddresses),
      subject,
      message,
      attachments: Array.isArray(attachments) ? attachments : [attachments],
    })

    // Send email
    console.log(`Email mode: ${emailMode}`)
    console.log(`Action sendEmail setting: ${sendEmail}`)
    console.log(`Suppress email override: ${!!other?.suppressEmail}`)

    if (
      emailMode !== 'NONE' &&
      sendEmail &&
      !other?.suppressEmail &&
      hasValidEmails &&
      transporter
    ) {
      console.log(
        `Sending email to: ${toAddresses}\ncc:${ccAddresses}\nbcc: ${bccAddresses}\nSubject: ${
          subject || ''
        }\n`
      )
      transporter
        .sendMail({
          from: `${fromName} <${fromEmail}>`,
          to: emailMode === 'TEST' ? [] : toAddresses,
          cc: emailMode === 'TEST' ? [] : ccAddresses,
          bcc: emailMode === 'TEST' ? testingEmail : bccAddresses,
          subject,
          text: message,
          html: marked(message),
          attachments: await prepareAttachments(attachments, appRootFolder, filesFolder),
        })
        .then(({ response, envelope, accepted, rejected, pending }: SentMessageInfo) => {
          const serverLogText = `Response: ${response}\nAccepted: ${accepted}\nRejected: ${
            rejected || ''
          }\nPending: ${pending || ''}`
          if (
            response.match(/250*/) &&
            (!rejected || rejected.length === 0) &&
            (!pending || pending.length === 0)
          ) {
            console.log(`Email successfully sent to: ${envelope.to}\n`)
            // Update notification table with email sent confirmation
            db.notificationEmailSent(notificationResult.id, serverLogText)
          } else {
            console.log(
              `Email sending had a problem: ${envelope.to}\nServer response: ${response}
              \nCheck "email_server_log" in "notification" table`
            )
            db.notificationEmailError(notificationResult.id, serverLogText)
          }
        })
        .catch((err) => {
          console.log(
            `Email sending FAILED: ${err.message}\nCheck "email_server_log" field in "notification" table`
          )
          db.notificationEmailError(notificationResult.id, `ERROR: ${err.message}`)
        })
    }
    //warnings and errors if send email isn't working
    if (!transporter) {
      console.log('Email not sent - missing email configuration')
      db.notificationEmailError(notificationResult.id, `WARNING: Email configuration not provided`)
    } else if (!hasValidEmails) {
      console.log('Email not sent - no valid email address')
      db.notificationEmailError(notificationResult.id, `WARNING: No valid email addresses`)
    }

    // NOTE: Because sending email happens asynchronously, the output object
    // for this Action does not reflect whether email has sent successfully.
    // The "email_sent" field in the notification table is the only record of this.

    // Accordingly, we should delete the "email_sent" property from the output,
    // as it is misleading (it's always "false")
    delete notificationResult.email_sent

    return {
      status: ActionQueueStatus.Success,
      error_log: !hasValidEmails ? 'WARNING: No valid email addresses' : '',
      output: { notification: notificationResult },
    }
  } catch (error) {
    console.log('Problem sending email:', errorMessage(error))
    return {
      status: ActionQueueStatus.Fail,
      error_log: errorMessage(error),
    }
  }
}

export default sendNotification

const validateEmailRecipientsList = (emailAddresses: string | string[]): string[] => {
  if (!Array.isArray(emailAddresses)) return isValidEmail(emailAddresses) ? [emailAddresses] : []
  return emailAddresses.filter((address) => isValidEmail(address))
}

const concatEmails = (to: string[], cc: string[], bcc: string[]): string => {
  let output = to.join(', ')
  if (cc) output += output ? ', ' + cc.join(', ') : cc.join(', ')
  if (bcc) output += output ? ', ' + bcc.join(', ') : bcc.join(', ')
  return output
}

/*
Takes an array of file paths in multiple formats and builds them into 
shape expected by sendMail method.
If only one attachment, can be provided without being in an array.
Input elements must be one of:
- <string> uniqueId of file (we will look up the path and filename)
- already formatted sendMail object, with the following properties:
{
  path: <full path/url of file>
  filename: <name to give attached file>
}
- TO-DO: Handle more types of input format (e.g. raw path/url strings)
*/
const prepareAttachments = async (
  attachments: string[] | Attachment[] | string | Attachment | null,
  appRootFolder: string,
  filesFolder: string
): Promise<Attachment[]> => {
  const attachmentInput = (Array.isArray(attachments) ? attachments : [attachments]).filter(
    (a) => a !== null
  )
  const attachmentObjects: Attachment[] = []
  for (const file of attachmentInput) {
    if (typeof file === 'object') {
      if (!file?.path || !file?.filename) throw new Error('Invalid attachment')
      attachmentObjects.push(file)
    } else {
      const { originalFilename, filePath } = await getFilePath(file)
      attachmentObjects.push({
        path: path.join(appRootFolder, filesFolder, filePath as string),
        filename: originalFilename,
      })
    }
  }
  return attachmentObjects
}
