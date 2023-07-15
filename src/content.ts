import Credential from 'models/Credential'
import { decrypt } from 'services/crypto'
import displayMessageOnErpLoginPage from 'utils/displayMessageOnErpLoginPage'
import fetchFromErp from 'utils/fetchFromErp'
import getPinFromDialog from 'utils/pinDialog'
import validateCredentials, { FieldValidationStatus } from 'utils/validateCredentials'

const login = async (res: { [key: string]: unknown }) => {
  /**
   * ?Skip if no credentials are stored or autoLogin is not enabled
   */

  if (!res.authCredentials) {
    displayMessageOnErpLoginPage('You have extension for automatic login. Please fill it', '#715100')
    return
  }

  const credentials = res.authCredentials as Credential

  if (!credentials.autoLogin) {
    displayMessageOnErpLoginPage('Automatic login is turned off!', '#4a4a4f')
    return
  }

  const fieldsValidationStatus = validateCredentials(res.authCredentials as { [key: string]: unknown })

  if (fieldsValidationStatus === FieldValidationStatus.SomeFieldIsEmpty) {
    displayMessageOnErpLoginPage('Please fill all the fields', '#4a4a4f')
    return
  }

  /**
   * ?Initialize the login process
   */

  if (fieldsValidationStatus === FieldValidationStatus.AllFieldsFilled)
    displayMessageOnErpLoginPage('Requesting otp! please wait...')

  const { requirePin, username } = credentials

  let pin = ''
  if (requirePin) {
    res.useAltPINDialog ? (pin = await getPinFromDialog()) : (pin = prompt('Enter your 4 digit PIN') ?? '')
  }

  let password, answer

  const questionRes = await fetchFromErp('/SSOAdministration/getSecurityQues.htm', `user_id=${username}`)
  const question = (await questionRes.text()) ?? 'FALSE'

  switch (question) {
    case credentials.q1:
      answer = credentials.a1
      break

    case credentials.q2:
      answer = credentials.a2
      break

    case credentials.q3:
      answer = credentials.a3
      break

    default:
      /**
       * !This means that the credentials are invalid
       */
      displayMessageOnErpLoginPage('Invalid username/password set! Please update your credentials', '#a4000f')
      return
  }

  if (requirePin) {
    try {
      password = await decrypt(credentials.password, pin as string)
      answer = await decrypt(answer, pin as string)
    } catch (_) {
      displayMessageOnErpLoginPage('Incorrect PIN!, Please reset if forgot or refresh page to retry.', '#a4000f')
      return
    }
  } else {
    password = credentials.password
  }

  // Get OTP
  const otpRes = await fetchFromErp('/SSOAdministration/getEmilOTP.htm', `typeee=SI&loginid=${credentials.username}`)
  const otpResObj = await otpRes.json()

  let email_otp
  if (otpResObj.msg) {
    email_otp = prompt(otpResObj.msg) ?? ''
  }

  if (typeof email_otp !== 'string') {
    displayMessageOnErpLoginPage('OTP not entered!', '#a4000f')
    return
  }

  displayMessageOnErpLoginPage('Logging you in! please wait...')

  const formEl = document.getElementById('loginForm') as HTMLFormElement

  ;(formEl.querySelector('#user_id') as HTMLInputElement).value = username
  ;(formEl.querySelector('#password') as HTMLInputElement).value = password
  ;(formEl.querySelector('#answer') as HTMLInputElement).value = answer
  ;(formEl.querySelector('#email_otp1') as HTMLInputElement).value = email_otp

  formEl.submit()
}

chrome.storage.local.get(
  {
    authCredentials: null,
    landingPage: null,
    useAltPINDialog: false
  },
  login
)
