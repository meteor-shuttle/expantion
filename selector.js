Shuttler.SelectorSelectAllowSchema = new SimpleSchema({
	field: {
		type: String,
		allowedValues: ["source", "target"]
	},
	from: {
		type: String,
		allowedValues: ["source", "target", "link"]
	},
	to: {
		type: String,
		allowedValues: ["source", "target", "link"],
		custom: function() {
			if (this.field('from') == this.value) return 'notAllowed';
		}
	}
});
Shuttler.SelectorSelectDenySchema = new SimpleSchema({
	field: {
		type: String,
		allowedValues: ["source", "target"]
	}
});
Shuttler.SelectedDocumentSchema = new SimpleSchema({
	from: {
		type: Shuttler.Ref.Schema,
		optional: true
	},
	path: {
		type: Shuttler.Ref.Schema,
		optional: true
	},
	root: {
		type: String
	},
	prev: {
		type: String,
		optional: true
	}
});
Mongo.Collection.prototype.attachSelect = function() {
	var collection = this;
	
	if (!this.isGraph) throw new Meteor.Error('Collection '+this._name+' is not a graph.');
	if (this.isSelectGraph) throw new Meteor.Error('It is not possible to attach functional of selection several times.');
	this.isSelectGraph = true;
	
	this.deny({
		update: function(userId, doc) {
			if (doc.root() != doc._id) throw new Meteor.Error('Access denied to update "selected" links.');
		}
	});
	
	this.attachSchema(new SimpleSchema({
		_selected: {
			type: Shuttler.SelectedDocumentSchema,
			optional: true
		}
	}));
	
	this.helpers({
		root: function() {
			return this._selected?this._selected.root:this._id;
		}
	});
	
	this.select = {}
	
	this.select._allowed = [];
	this.select._allowedField = { source: false, target: false };
	
	var generateShortNamesSelectAllow = function(selector) {
		return {
			So: selector.field, // selected changes field
			Ta: selector.field=='source'?'target':'source', // target of selection
			Fr: selector.from, // path from
			To: selector.to // path to
		};
	};
	
	var isipv = {
		fromLink: function(short, paths, selected, path) {
			insertSelectedIntoPathCore(short, paths, selected, path, path['_'+short.To], path.Ref(), selected._id);
		},
		toLink: function(short, paths, selected, path) {
			insertSelectedIntoPathCore(short, paths, selected, path, path.Ref(), path['_'+short.Fr], selected._id);
		},
		else: function(short, paths, selected, path) {
			insertSelectedIntoPathCore(short, paths, selected, path, path['_'+short.To], path['_'+short.Fr], selected._id);
		}
	};
	
	// from -> to
	var insertSelectedIntoPathVariantsHash = {
		'link': { 'source': isipv.fromLink, 'target': isipv.fromLink },
		'source': { 'target': isipv.else, 'link': isipv.toLink },
		'target': { 'source': isipv.else, 'link': isipv.toLink },
	};
	
	var insertSelectedIntoPathCore = function(short, paths, selected, path, so, from, prev) {
		for (var d in collection.select._denied) {
			if (collection.select._denied[d].find({
				$or: [
					{ '_source.id': so.id, '_source.collection': so.collection },
					{ '_target.id': so.id, '_target.collection': so.collection }
				]
			}).count()) return undefined;
		}
		if (!collection.find({
			['_'+short.Ta+'.id']: selected['_'+short.Ta].id, ['_'+short.Ta+'.collection']: selected['_'+short.Ta].collection,
			['_'+short.So+'.id']: so.id, ['_'+short.So+'.collection']: so.collection,
			'_selected.path.id': path?path._id:undefined, '_selected.path.collection': path?paths._name:undefined,
			'_selected.from.id': from?from.id:undefined, '_selected.from.collection': from?from.collection:undefined,
			'_selected.prev': prev?prev:undefined,
			'_selected.root': selected.root()
		}).count()){
			collection.insert({
				['_'+short.Ta]: selected['_'+short.Ta], ['_'+short.So]: so,
				'_selected': {
					path: path?path.Ref():undefined,
					from: from?from:undefined,
					prev: prev?prev:undefined,
					root: selected.root()
				}
			});
		}
	};
	
	this.select.allow = function(graph, selector) {
		var context = Shuttler.SelectorSelectAllowSchema.newContext();
		if (!context.validate(selector)) {
			throw new Meteor.Error(context.keyErrorMessage(context.invalidKeys()[0].name));
		}
		
		if (!(graph instanceof Mongo.Collection)) throw new Meteor.Error('Graph must be a Mongo.Collection');
		var paths = graph;
		var selects = collection;
		
		collection.select._allowed.push({ graph: graph, selector: selector });
		collection.select._allowedField[selector.field] = true;
		
		var short = generateShortNamesSelectAllow(selector);
		let { So, Ta, Fr, To } = short;
		
		var insertSelectedIntoPath = insertSelectedIntoPathVariantsHash[Fr][To];
		
		if (Fr == 'link') {
			var findEachPaths = function(selected, handler) {
				if (selected['_'+So].collection == paths._name)
					handler(selected[So]());
			};
		} else {
			var findEachPaths = function(selected, handler) {
				paths.links.find[Fr](selected['_'+So]).forEach(handler);
			};
		}
		
		if (Fr == 'link') {
			var findEachSelected = function(path, handler) {
				selects.links.find[So](path.Ref()).forEach(handler);
			};
		} else {
			var findEachSelected = function(path, handler) {
				selects.links.find[So](path['_'+Fr]).forEach(handler);
			};
		}
		
		// on So link
		selects.after.link[So](function(userId, selected, fieldNames, modifier, options) {
			var selected = selects._transform(selected);
			if (selected.root() == selected._id) {
				insertSelectedIntoPathCore(short, paths, selected, undefined, selected['_'+So], undefined, undefined);
			} else {
				findEachPaths(selected, function(path) {
					insertSelectedIntoPath(short, paths, selected, path);
				});
			}
		});
		
		// on So unlink
		selects.after.unlink[So](function(userId, selected, fieldNames, modifier, options) {
			var selected = selects._transform(selected);
			var doc = this.action=='remove'?selected:this.previous;
			if (selected.root() == selected._id) {
				selects.remove({
					'_selected.root': selected._id,
					'_selected.prev': undefined, '_selected.path': undefined,
					'_source.id': doc._source.id, '_source.collection': doc._source.collection,
					'_target.id': doc._target.id, '_target.collection': doc._target.collection
				});
			} else {
				selects.remove({
					'_selected.root': selected.root(),
					'_selected.prev': selected._id,
					'_selected.from.id': doc['_'+selector.field].id,
					'_selected.from.collection': doc['_'+selector.field].collection
				});
			}
		});
		
		// on Ta link
		selects.after.link[Ta](function(userId, selected, fieldNames, modifier, options) {
			var selected = selects._transform(selected);
			if (this.action == 'update' && selected.root() == selected._id) {
				selects.update({ '_selected.root': selected._id }, {
					$set: selected[Ta]().Ref('_'+Ta)
				}, { multi: true });
			}
		});
		
		// on path unlink
		paths.after.unlink(function(userId, path, fieldNames, modifier, options) {
			var path = selects._transform(path);
			selects.remove({
				'_selected.path.id': path._id,
				'_selected.path.collection': paths._name
			});
		});
		
		// on path link
		paths.after.link(function(userId, path, fieldNames, modifier, options) {
			var path = paths._transform(path);
			findEachSelected(path, function(selected) {
				insertSelectedIntoPath(short, paths, selected, path);
			});
		});
	};
	
	this.select._denied = [];
	
	var generateShortNamesSelectDeny = function(selector) {
		return {
			So: selector.field, // selected changes field
			Ta: selector.field=='source'?'target':'source' // target of selection
		};
	};
	
	this.select.deny = function(graph, selector) {
		var context = Shuttler.SelectorSelectDenySchema.newContext();
		if (!context.validate(selector)) {
			throw new Meteor.Error(context.keyErrorMessage(context.invalidKeys()[0].name));
		}
		
		if (!(graph instanceof Mongo.Collection)) throw new Meteor.Error('Graph must be a Mongo.Collection');
		collection.select._denied.push(graph);
		
		var dShort = generateShortNamesSelectDeny(selector);
		
		var deny = graph;
		var allow = collection;
		
		deny.after.unlink[dShort.So](function(userId, denied, fieldNames, modifier, options) {
			var denied = deny._transform(denied);
			
			lodash.each(collection.select._allowed, function(_a) {
				var _aShort = generateShortNamesSelectAllow(_a.selector);
				
				if (_aShort.To == 'link') {
					_a.graph.find({
						_id: denied['_'+dShort.So].id
					}).forEach(function(path) {
						allow.links.find[_aShort.So](path['_'+_aShort.Fr], { '_selected': { $exists: true } }).forEach(function(a) {
							insertSelectedIntoPathVariantsHash[_aShort.Fr][_aShort.To](_aShort, _a.graph, a, path);
						});
					});
				} else {
					_a.graph.find({
						['_'+_aShort.To+'.id']: denied['_'+dShort.So].id,
						['_'+_aShort.To+'.collection']: denied['_'+dShort.So].collection
					}).forEach(function(path) {
						if (_aShort.Fr == 'link') {
							allow.links.find[_aShort.So](path, { '_selected': { $exists: true } }).forEach(function(a) {
								insertSelectedIntoPathVariantsHash[_aShort.Fr][_aShort.To](_aShort, _a.graph, a, path);
							});
						} else {
							allow.links.find[_aShort.So](path['_'+_aShort.Fr], { '_selected': { $exists: true } }).forEach(function(a) {
								insertSelectedIntoPathVariantsHash[_aShort.Fr][_aShort.To](_aShort, _a.graph, a, path);
							});
						}
					});
				}
				
				
				allow.links.find[_aShort.So](denied['_'+dShort.So], { '_selected': { $exists: false } }).forEach(function(allowed) {
					insertSelectedIntoPathCore(_aShort, _a.graph, allowed, undefined, allowed['_'+_aShort.So], undefined, undefined);
				});
			});
		});
		
		deny.after.link[dShort.So](function(userId, denied, fieldNames, modifier, options) {
			var denied = deny._transform(denied);
			
			if (collection.select._allowedField.source) {
				allow.remove({
					'_selected': { $exists: true },
					['_source.id']: denied['_'+dShort.So].id,
					['_source.collection']: denied['_'+dShort.So].collection
				});
			}
			if (collection.select._allowedField.target) {
				allow.remove({
					'_selected': { $exists: true },
					['_target.id']: denied['_'+dShort.So].id,
					['_target.collection']: denied['_'+dShort.So].collection
				});
			}
		});
	}
};