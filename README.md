# Selector

Selectors in links of documents by links in graphs.

The server automatically maintains the integrity.
Links is created automatically can not be manually changed.
If you change the path of selection or root link, then selected links will be recalculated.

##### Required
* [shuttler:ref](https://github.com/meteor-shuttler/ref)
* [shuttler:graphs](https://github.com/meteor-shuttler/graphs)

## Install

```
meteor add shuttler:selector
```

## Features

* Maintaining the integrity of insert, update, and remove links.
* Selecting can be in either direction: from source/target/link to source/target/link.

## Example

```js
// index.js
posts = new Mongo.Collection('posts');

nesting = new Mongo.Collection('nesting');
nesting.attachGraph();

rule = new Mongo.Collection('rule');
rule.attachGraph();
rule.attachSelect();

if (Meteor.isServer) {
	rule.select({
		graph: 'nesting',
		field: 'source',
		from: 'target',
		to: 'source'
	});
}
```

```js
// Client console
posts.insert({ _id: '1' });
// '1'
posts.insert({ _id: '2' });
// '2'
posts.insert({ _id: '3' });
// '3'
posts.insert({ _id: '4' });
// '4'
nesting.link.insert(posts.findOne('2'), posts.findOne('1'));
// xDwGqiGYmAdBx3WRZ
nesting.link.insert(posts.findOne('3'), posts.findOne('2'));
// mBymHj5KkLDRFvgtr
rule.link.insert(posts.findOne('1'), posts.findOne('1'));
// tCmPSGhNDoZPWTx9g
rule.find().fetch();
/* [
	{
		"_id":"tCmPSGhNDoZPWTx9g",
		"_source":{"id":"1","collection":"posts"},
		"_target":{"id":"1","collection":"posts"}
	},{
		"_id":"aXHreebuwiRs22zfv",
		"_target":{"id":"1","collection":"posts"},
		"_source":{"id":"2","collection":"posts"},
		"_selected":{
			"path":{"id":"xDwGqiGYmAdBx3WRZ","collection":"nesting"},
			"from":{"id":"1","collection":"posts"},
			"prev":"tCmPSGhNDoZPWTx9g","root":"tCmPSGhNDoZPWTx9g"
		}
	},{
		"_id":"QPt9NGQRrwQasxcLx",
		"_target":{"id":"1","collection":"posts"},
		"_source":{"id":"3","collection":"posts"},
		"_selected":{
			"path":{"id":"mBymHj5KkLDRFvgtr","collection":"nesting"},
			"from":{"id":"2","collection":"posts"},
			"prev":"aXHreebuwiRs22zfv",
			"root":"tCmPSGhNDoZPWTx9g"
		}
	}
] */
```

## Documentation

### Methods

#### graph.attachSelect
> ()

Attach to the collection-graph `collection.select` method and field `_selected` with schema `Shuttle.SelectedDocumentSchema`.

It can be used only once.

#### collection.select

Methods and temporary storage of information about the rules of selection / inheritance / expansion in this graph.

#### collection.select.allow
> (graph: Mongo.Collection, selector: Selector)

It includes listening to this graph changes and the graph transferred to the selector.

Reacting to changes in their support this graph in an integrity.

You can call this method several times. For example, you can inherit from document to document and from the document to the link.

##### Graph
> Mongo.Collection

Collection-graph whose links will be used as paths for selection.

##### Selector
> Object

###### field
> "source"|"target"

The field pointing in this graph to the selected documents.

###### from
> "source"|"target"|"link"

From what part of the link in a given `selector.graph` will continue the selection.

###### to
> "source"|"target"|"link"

On what will expend the selection started from `from`.

## Soon
- [ ] `Selector.query?` `Object` mongodb query condition to enable or disable selection from root link, to support management of the selection from database
- [ ] `collection.select.deny(graph: Mongo.Collection)` to be able to stop the selection of one graph by crossing with other graph with root link relevant to query

## Versions
* New syntax for select.
* New future logic to deny.