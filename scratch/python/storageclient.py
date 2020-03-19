import e3db

configDict = {
  'client_id': '3ac47591-be5f-4e2a-a54e-8d1c3509fe79',
  'api_key_id': 'f6d08df1e4491e89e268e834a7b7a4f901a6ef760db8618af52b1eebaba81f54',
  'api_secret': '1fdda2e6ce04852de6144d62e92bd525f362f9118bf5be839b0ea4d84ba5fd68',
  'public_key': 'F6oSdtdyr5cYVcAD_nOMg0ZyO2Urb1eMhbdiGNvfLik',
  'private_key': '6BnUBrnDMbQPkfOyXQQ8M6bgBDOSPfyAeq54ZadPuqA',
  'client_email': '',
  'version': '1',
  'api_url': 'http://platform.local.tozny.com:8000',
}

config = e3db.Config (
  configDict['client_id'],
  configDict['api_key_id'],
  configDict['api_secret'],
  configDict['public_key'],
  configDict['private_key'],
  configDict['client_email'],
  configDict['version'],
  configDict['api_url'],
)

CLIENT = e3db.Client(config())
