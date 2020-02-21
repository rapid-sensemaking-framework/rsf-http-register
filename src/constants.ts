const VIEWS = {
  REGISTER: 'register'
}

const URLS = {
  DEV: {
    REGISTER: '/dev-register'
  },
  REGISTER: (id: string) => `/register/${id}`,
  HANDLE_REGISTER: (pre: string) => `${pre}/new-participant`
}

const EVENTS = {
  /* INBOUND */
  //  initial creation
  PARTICIPANT_REGISTER: 'participant_register',
  // commence/open
  OPEN_REGISTER: 'open_register',
  /* OUTBOUND */
  // final / sum
  PARTICIPANT_REGISTER_RESULTS: 'participant_register_results',
  // each individual
  PARTICIPANT_REGISTER_RESULT: 'participant_register_result'
}

export { VIEWS, URLS, EVENTS }
