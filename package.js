Package.describe({
  name: 'shuttler:selector',
  version: '0.0.5',
  summary: 'Selectors in links of documents by links in graphs.',
  git: 'https://github.com/meteor-shuttler/selector',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  
  api.use('mongo');
  api.use('ecmascript');
  
  api.use('stevezhu:lodash@4.3.0');
  api.use('aldeed:collection2@2.9.0');
  api.use('dburles:collection-helpers@1.0.4');
  api.use('dburles:mongo-collection-instances@0.3.5');
  api.use('matb33:collection-hooks@0.8.1');
  api.use('ivansglazunov:restrict@0.0.2');
  api.use('shuttler:graphs@0.0.5');
  
  api.addFiles('selector.js');
  
  api.export('Shuttler');
});