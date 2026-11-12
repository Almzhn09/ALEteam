import {Suspense} from 'react';
import {PlacesExplorer} from './PlacesExplorer';
import {languageAlternates} from '@/lib/seo';
export function generateMetadata(){return {alternates:languageAlternates('/places')};}
export default function PlacesPage(){return <Suspense><PlacesExplorer/></Suspense>;}
