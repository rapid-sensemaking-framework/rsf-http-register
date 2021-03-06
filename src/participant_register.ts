import * as express from 'express'
import { VIEWS, URLS, EVENTS } from './constants'
import {
  ContactableConfig,
  ParticipantRegisterConfig,
  RegisterTypesConfig
} from 'rsf-types'

interface Register {
  id: string
  showParticipantBlock: boolean
  showTime: boolean
  startTime: number
  maxTime: number
  maxParticipants: number | string
  title: string
  description: string
  types: RegisterTypesConfig
  registrationHasOpened: boolean
  registrationClosed: boolean
  results: ContactableConfig[]
}

// For handlebars templates
interface RegisterTemplate {
  formHandler: string
  showParticipantBlock: boolean
  showTime: boolean
  remainingTime: string
  maxParticipants: number | string
  participantCount: number
  title: string
  description: string
  types: RegisterTypesConfig
  registrationHasOpened: boolean
  registrationClosed: boolean
  layout: boolean
}

const addTestDevPage = (app: express.Application) => {
  /* dev endpoint */
  app.get(URLS.DEV.REGISTER, (req, res) => {
    const registerTemplate: RegisterTemplate = {
      formHandler: URLS.DEV.HANDLE_REGISTER,
      showParticipantBlock: true,
      showTime: true,
      title: 'You are invited',
      remainingTime: '600',
      maxParticipants: `Registration is limited to 3 participants.`,
      participantCount: 2,
      description: 'test',
      types: {
        sms: false,
        telegram: true,
        mattermost: true
      },
      registrationHasOpened: true,
      registrationClosed: false,
      layout: false
    }
    res.render(VIEWS.REGISTER, registerTemplate)
  })

  // endpoint for handling form submits
  app.post(
    URLS.DEV.HANDLE_REGISTER,
    express.urlencoded({ extended: true }),
    (req, res) => {
      try {
        validateInput(req.body)
      } catch (e) {
        res.redirect(`${URLS.DEV.REGISTER}?failure&type=${req.body.type}&reason=${e.message}`)
        return
      }

      res.redirect(`${URLS.REGISTERED}?type=${req.body.type}`)
    }
  )
}

// The page that shows people confirmation that they've registered successfully
const addRegisteredPage = (app: express.Application) => {
  app.get(URLS.REGISTERED, (req, res) => {
    const type = new URLSearchParams(req.query).get('type')
    const registeredTemplate = {
      typeAsString: type,
      layout: false
    }
    registeredTemplate[type] = true
    res.render(VIEWS.REGISTERED, registeredTemplate)
  })
}

// validate a proposed ContactableConfig
const validateInput = (input: ContactableConfig): void => {
  if (!input.type) throw new Error('type cannot be blank')
  if (!input.id) throw new Error('identity cannot be blank')
  if (input.id.includes(' ')) throw new Error('identity cannot contain spaces')
}

const remainingTime = (maxTimeInSeconds: number, startTime: number): string => {
  const secondsElapsed = (Date.now() - startTime) / 1000
  return (maxTimeInSeconds - secondsElapsed).toFixed() // round it
}

type EachNewCallback = (newParticipant: ContactableConfig) => void
const defaultEachNewParticipant: EachNewCallback = () => {}

const createNewRegister = (
  app: express.Application,
  id: string,
  maxTimeInSeconds: number,
  maxParticipants: number | string,
  title: string,
  description: string,
  types: RegisterTypesConfig
) => {
  const register: Register = {
    id,
    types,
    title,
    description,
    maxParticipants,
    maxTime: maxTimeInSeconds,
    showParticipantBlock: true,
    showTime: true,
    startTime: null,
    results: [],
    registrationHasOpened: false,
    registrationClosed: false
  }

  // new route for serving the registration form page
  app.get(id, (req, res) => {
    const formHandler = URLS.HANDLE_REGISTER(id)
    const remaining = register.registrationHasOpened
      ? remainingTime(register.maxTime, register.startTime)
      : null
    const { maxParticipants } = register
    const registerTemplate: RegisterTemplate = {
      formHandler,
      showParticipantBlock: true,
      showTime: true,
      remainingTime: remaining,
      maxParticipants:
        maxParticipants === '*'
          ? 'The number of participants is unlimited.'
          : `Registration is limited to ${maxParticipants} participant${
              maxParticipants === 1 ? '' : 's'
            }.`,
      participantCount: register.results.length,
      title: register.title,
      description: register.description,
      registrationHasOpened: register.registrationHasOpened,
      registrationClosed: register.registrationClosed,
      types: register.types,
      layout: false
    }
    res.render(VIEWS.REGISTER, registerTemplate)
  })

  return register
}

const openRegister = (
  app: express.Application,
  register: Register,
  eachNew: EachNewCallback = defaultEachNewParticipant
): Promise<ContactableConfig[]> => {
  return new Promise(resolve => {
    // modify that register
    register.startTime = Date.now()
    register.registrationHasOpened = true
    const formHandler = URLS.HANDLE_REGISTER(register.id)
    const maxTimeInMilliseconds = register.maxTime * 1000
    // stop the process after a maximum amount of time
    const timeoutId = setTimeout(() => {
      // complete, saving whatever results we have
      complete()
    }, maxTimeInMilliseconds)
    // setup a completion handler that
    // can only fire once
    const complete = () => {
      if (!register.registrationClosed) {
        register.registrationClosed = true
        clearTimeout(timeoutId)
        resolve(register.results)
      }
    }

    // endpoint for handling form submits
    app.post(
      formHandler,
      express.urlencoded({ extended: true }),
      (req, res) => {
        // registration has ended already?
        if (register.registrationClosed) {
          res.sendStatus(403) // Forbidden
          return
        }
        const input = req.body

        try {
          validateInput(input)
        } catch (e) {
          res.redirect(`${register.id}?failure&type=${input.type}&reason=${e.message}`)
          return
        }

        const newParticipant: ContactableConfig = {
          id: input.id,
          type: input.type,
          name: input.name
        }
        // add to final results
        register.results.push(newParticipant)
        // also call into callback with each new result
        eachNew({ ...newParticipant }) // clone
        if (register.results.length === register.maxParticipants) {
          complete()
        }
        res.redirect(`${URLS.REGISTERED}?type=${input.type}`)
      }
    )
  })
}

const addSocketListeners = (io: SocketIO.Server, app: express.Application) => {
  const registers: { [id: string]: Register } = {}
  io.on('connection', function(client) {
    // create a new register page
    client.on(
      EVENTS.PARTICIPANT_REGISTER,
      async (participantRegisterConfig: ParticipantRegisterConfig) => {
        const {
          id,
          title,
          description,
          maxParticipants,
          maxTime,
          types
        } = participantRegisterConfig

        const mountPoint = URLS.REGISTER(id)
        const register = createNewRegister(
          app,
          mountPoint,
          maxTime,
          maxParticipants,
          title,
          description,
          types
        )
        registers[id] = register
      }
    )
    // activate or open a registration
    client.on(EVENTS.OPEN_REGISTER, async (id: string) => {
      const register = registers[id]
      if (!register) {
        client.emit(EVENTS.NO_REGISTER_WITH_ID, id)
        return
      }
      const results: ContactableConfig[] = await openRegister(
        app,
        register,
        // forward each new registration live as well
        (newParticipant: ContactableConfig) => {
          client.emit(EVENTS.PARTICIPANT_REGISTER_RESULT, newParticipant)
        }
      )
      // send the final results when we've got them
      client.emit(EVENTS.PARTICIPANT_REGISTER_RESULTS, results)
    })
  })
}
export { addRegisteredPage, addSocketListeners, addTestDevPage }
