// Static, reviewed local engines only. Never load modules or URLs from HTTP input.
import type {DiscoveryEngines} from '../contracts/discovery';
import {arturDiscoveryEngines} from './artur-discovery/transport';
export const discoveryEngines:DiscoveryEngines=arturDiscoveryEngines;
