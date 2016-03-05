Shuttler.SelectorFunctionSchema = new SimpleSchema({
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
Shuttler.SelectedDocumentSchema = new SimpleSchema({
	from: {
		type: Shuttler.Ref.Schema
	},
	path: {
		type: Shuttler.Ref.Schema
	},
	root: {
		type: String
	},
	prev: {
		type: String
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
	
	this.select = {
		allowed: []
	};
	
	this.select.allow = function(graph, selector) {
		var context = Shuttler.SelectorFunctionSchema.newContext();
		if (!context.validate(selector)) {
			throw new Meteor.Error(context.keyErrorMessage(context.invalidKeys()[0].name));
		}
		
		if (!(graph instanceof Mongo.Collection)) throw new Meteor.Error('Graph must be a Mongo.Collection');
		var paths = graph;
		var selects = collection;
		
		collection.select.allowed.push({ graph: graph, selector: selector });
		
		var So = selector.field; // selected changes field
		var Ta = selector.field=='source'?'target':'source'; // target of selection
		var Fr = selector.from; // path from
		var To = selector.to; // path to
		
		var insertSelectedIntoPathCore = function(selected, path, so, from) {
			if (!selects.find({
				['_'+Ta+'.id']: selected['_'+Ta].id, ['_'+Ta+'.collection']: selected['_'+Ta].collection,
				['_'+So+'.id']: so.id, ['_'+So+'.collection']: so.collection,
				'_selected.path.id': path._id, '_selected.path.collection': paths._name,
				'_selected.from.id': from.id, '_selected.from.collection': from.collection,
				'_selected.prev': selected._id, '_selected.root': selected.root()
			}).count()){
				selects.insert({
					['_'+Ta]: selected['_'+Ta], ['_'+So]: so,
					'_selected': { path: path.Ref(), from: from, prev: selected._id, root: selected.root() }
				});
			}
		};
		
		if (Fr == 'link') {
			var insertSelectedIntoPath = function(selected, path) {
				insertSelectedIntoPathCore(selected, path, path['_'+To], path.Ref());
			};
		} else if (To == 'link') {
			var insertSelectedIntoPath = function(selected, path) {
				insertSelectedIntoPathCore(selected, path, path.Ref(), path['_'+Fr]);
			};
		} else {
			var insertSelectedIntoPath = function(selected, path) {
				insertSelectedIntoPathCore(selected, path, path['_'+To], path['_'+Fr]);
			};
		}
		
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
		
		// on So link
		selects.after.link[So](function(userId, selected, fieldNames, modifier, options) {
			var selected = selects._transform(selected);
			findEachPaths(selected, function(path) {
				insertSelectedIntoPath(selected, path);
			});
		});
		
		// on So unlink
		selects.after.unlink[So](function(userId, selected, fieldNames, modifier, options) {
			var selected = selects._transform(selected);
			var doc = this.action=='remove'?selected:this.previous;
			selects.remove({
				'_selected.root': selected.root(),
				'_selected.prev': selected._id,
				'_selected.from.id': doc['_'+selector.field].id,
				'_selected.from.collection': doc['_'+selector.field].collection
			});
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
		
		if (Fr == 'link') {
			var findEachSelected = function(path, handler) {
				selects.links.find[So](path.Ref()).forEach(handler);
			};
		} else {
			var findEachSelected = function(path, handler) {
				selects.links.find[So](path['_'+Fr]).forEach(handler);
			};
		}
		
		// on path link
		paths.after.link(function(userId, path, fieldNames, modifier, options) {
			var path = paths._transform(path);
			findEachSelected(path, function(selected) {
				insertSelectedIntoPath(selected, path);
			});
		});
	};
};