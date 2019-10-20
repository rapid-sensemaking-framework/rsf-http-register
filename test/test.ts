import * as dotenv from 'dotenv'
dotenv.config()
import { start, overrideJsonGraph, convertDataFromSheetToRSF } from '../src/run_graph'
import { ContactableConfig } from '../src/types'

const inputsFromSheets = {
  'rsf/CollectResponses_lctpp--prompt': 'npm run test prompt', // CollectResponses prompt
  'rsf/CollectResponses_lctpp--max_responses': '3', // CollectResponses max responses
  'rsf/CollectResponses_lctpp--max_time': '1', // CollectResponses max time (minutes)
  'rsf/ResponseForEach_cd3dx--max_time': '1', // ResponseForEach max time (minutes)
  'rsf/ResponseForEach_cd3dx--options': 'a+A=Agree, b+B=Block, c+C=Clock', // ResponseForEach options
}
const participantConfigs: ContactableConfig[][] = [
  [{ type: 'telegram', id: 'connorturland' }], // ideation
  [{ type: 'telegram', id: 'connorturland' }], // reaction
  [{ type: 'telegram', id: 'connorturland' }] // summary
]
const convertedInputs = convertDataFromSheetToRSF(inputsFromSheets, participantConfigs)
const jsonGraph = overrideJsonGraph(convertedInputs, 'ideation-reaction.json')


const dataWatcher = (signal) => {
  if (signal.id === 'rsf/FormatReactionsList_cukq9() FORMATTED -> IN core/MakeFunction_lsxgf()') {
    console.log('results', signal.data)
  }
}
start(jsonGraph, dataWatcher)
  .then(() => {
    console.log('success')
    process.exit(0)
  })
  .catch(e => {
    console.log('error', e)
    process.exit(1)
  })
