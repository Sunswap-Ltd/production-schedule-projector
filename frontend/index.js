import {initializeBlock} from '@airtable/blocks/interface/ui';
import React from 'react';
import App from './App';

initializeBlock({interface: () => <App />});
