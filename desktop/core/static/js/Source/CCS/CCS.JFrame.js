// Licensed to Cloudera, Inc. under one
// or more contributor license agreements.  See the NOTICE file
// distributed with this work for additional information
// regarding copyright ownership.  Cloudera, Inc. licenses this file
// to you under the Apache License, Version 2.0 (the
// "License"); you may not use this file except in compliance
// with the License.  You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/*
---
description: JFrame--Configurable "container" for simple HTML pages, within the CCS framework.
provides: [CCS.JFrame]
requires: 
 - Core/Request.JSON
 - More/URI
 - More/Element.Delegation
 - More/Fx.Scroll
 - More/Elements.From
 - clientcide/Collapsible
 - Widgets/ART.Alerts
 - More/String.Extras
 - Widgets/ART.SplitView
 - More/HtmlTable.Sort
 - More/HtmlTable.Select
 - More/Spinner
 - /CCS
 - /CCS.ContextMenu
script: CCS.JFrame.js
...
*/
CCS.JFrame = new Class({

	Extends: ART.Widget,

	Implements: [ART.WindowTools, ART.Window.AlertTools],

	ns: 'hue',

	name: 'jframe',

	options: {
		/**
		//EVENTS:
		//all the events in ART.Widget, plus:
		onRequest: $empty(requestPath, userData),
		onBeforeRenderer: $empty(content, options), //see _applyRenderers method for details
		afterRenderer: $empty(content, options) //ditto
		onLoadComplete: $empty(data),
		onLoadError: $empty(error), //the jframe failed to load. An error alert has already displayed.
		onRedirect: empty(redirectedTo, originalRequestedURL), //the response was redirected (before content has been rendered)
		redirectAfterRender: empty(redirectedTo, originalRequestedURL), //after content is rendered
		size: {
			width: ,
			height: 
		},

		**/
		//evaluateJs: if true, script tags are evaluated when content is loaded
		evaluateJs: false,
		//includeLinkTags: if true, css <link> tags are injected into the DOM
		includeLinkTags: false,
		//useSpinner: if true, the content of the jFrame is masked when loading
		useSpinner: true,
		//linkers: a key/value set of linkers (see the addLinker method for docs)
		linkers: {},
		filters: {},
		//the selector to match clicks against for delegation; defaults to only links
		clickRelays: 'a',
		//given the response and response text, this method determines if there's been a serverside error
		errorDetector: function(requestInstance, repsonseText) {
			//flag this as an error
			return repsonseText.contains('ccs-error-popup');
		},
		getScroller: function(){
			return this.element;
		},
		//passed the options that generated the request; see renderContent's options
		spinnerCondition: function(options){
			if (!this.loadedOnce) return false;
			if (options.autorefreshed && this._noSpinnerOnAutoRefresh) return false;
			return this.options.useSpinner;
		}
	},

	// path: initial page to load
	initialize: function(path, options){
		this.parent(options);
		new ART.Keyboard(this, this.keyboardOptions);
		this.addLinkers(this.options.linkers);
		this.addFilters(this.options.filters);
		this.element.addClass('jframe_wrapper').addClass('ccs-shared');
		this.scroller = new Fx.Scroll(this.options.getScroller.call(this));
		this.content = new Element('div', {
			'class': 'jframe_contents'
		}).inject(this.element);

		if (this.options.size) this.resize(this.options.size.width, this.options.size.height);
		this.load({requestPath: path});
	},

	toElement: function(){
		return this.element;
	},

	_createElement: function(){
		this.element = this.element || new Element('div').setStyles({display: 'block', position: 'relative', outline: 'none'}).store('widget', this);
	},

	/*
		applies the default link handling delegates to a specific target, allowing you to attach link handling to any container
		target - (*element*) the element to which you wish to attach delegates
	*/
	delegatedTo: [],
	
	applyDelegates: function(target){
		target = document.id(target) || this.content;
		//make sure we only apply this once per target
		if (this.delegatedTo.contains(target)) return;
		this.delegatedTo.push(target);
		
		var handler = function(e, elem, url, target){
			if (elem.get('tag') == 'a') e.preventDefault();
			if (!this._checkLinkers(e, elem)) {
				// If it's an anchor link, do scrolling
				if (url && url.get('fragment')) {
					// hrefs are url-encoded, but the "name" for the links isn't
					target = this.content.getElement('a[name=' + unescape(url.get('fragment')) + ']');
					if (target) {
						this.scroller.toElement(target);
						return;
					}
				}
				var path = url ? url.toString() : '';
				if (!path) return;

				this.load({
					requestPath: path
				});

			}
		}.bind(this);
		this.callClick = function(e, elem){
			//allow links to force jframe to nerf them
			//this is required for doubleclick support
			//as otherwise there's no way to prevent this default jframe handler per link
			if (elem.hasClass('jframe_ignore')) return e.preventDefault();
			// Fix relative links
			if (elem.get('href')) {
				var url = new URI(elem.get('href'), {base: this.currentPath});
				if (url) elem.set('href', url.toString());
				var me = new URI();
				// If it's an external link
				if (url.get('scheme') != me.get('scheme') ||
						url.get('host') != me.get('host') ||
						url.get('port') != me.get('port')) {
					// Open external URLs in a new window.
					// TODO(todd) should also check that the URL begins with
					// whatever our prefix is, but "prefix" isn't really known
					// by this class with the current design.
					elem.set('target', '_blank');
				} else {
					handler(e, elem, url);
				}
			} else {
				handler(e, elem);
			}
		}.bind(this);
		target.addEvent('click:relay(' + this.options.clickRelays + ')', this.callClick);
	},

	/**
	 * Cause the content of this JFrame to load a particular URL.
	 *   options: see renderContent's options
	 */
	load: function(options){
		this.fireEvent('request', [options.requestPath, options.userData]);
		var req = new Request();
		this._setRequestOptions(req, 
			$merge(options, {
				method: options.method || 'get',
				url: new URI(options.requestPath).toString()
			})
		);
		req.send();
	},

	disableSpinnerUsage: function(){
		this._noSpinnerOnAutoRefresh = true;
	},

	enableSpinnerUsage: function(){
		this._noSpinnerOnAutoRefresh = false;
	},

	/** refresh the current content */
	refresh: function(options){
		this.fireEvent('refresh');
		this.load(
			$merge(options, {
				requestPath: this.currentPath
			})
		);
	},

	/*
	options:
		content: content to render (html, dom element, or $$ collection of dom elements), 
		responsePath: the path to this content, 
		title: the title for the frame for this content, 
		userData: data to be passed along to the loadComplete event,
		target: dom element or id to fill with content; defaults to this.content
		suppressLoadComplete: (boolean) if true, the loadComplete event is not fired
		callback: a callback to execute after rendering; passed an object with content, responsePath, title, and target
		error: the server has returned an error
		autorefreshed: (boolean) whether or not this refresh was user initiated
		blankWindowWithError: the window is empty (and will remain so)

	notes:
		the loadComplete and callback methods are passed an object with the following attributes:
		content: the content returned from the server, unaltered
		elements: an array of DOM elements rendered from that response, excluding the script, style, and meta tags
		scripts: the inline js in the response (any text in a script tag)
		styles: all the link and style tags
		meta: all the meta tags in teh response
		responsePath: the path of what was returned (url),
		title: the title, stripped from the content as the inner text of the *title* tag, or the inner text of the first *h1*, or the path
		userData: any data passed in to the request (used for login)
		view: the view (string; see below)
		viewElement: the view element (DOM element, see below)
		target: the target where the content was loaded
		toolbar: the toolbar elements (see below),
		footer: the footer elements (see below)
		
	views:
		The content of a JFrame request is searched for the first element with the class "view". 
		If found, the id of this element is treated as the current view. This id is stripped (all
		Desktop apps do not use ids, as there may be more than one of them). The data object passed
		to the loadComplete event and the callback in the options contains this view (the value of
		the id of the element) as well as the viewElement. This allows your code to attach logic
		based on the view (a 'controler'). Just wrap your response in a div with the class "view" and
		an id and you can switch on that in the event handler you attach.
		
		example html response:
		<div id="jobbrowser_job_list" class="view">
			<!-- the html for your view -->
		</div>
		
		in your script:
		myJframe.addEvent('loadComplete', function(data) {
			if (data.view == 'jobbrowser_job_list') new CCS.JobBrowser.JobView(data.viewElement);
		})
	
	toolbars:
		The content of a JFrame request is searched for elements with the class "toolbar" and "footer".
		These elements are referenced in the data passed to the loadComplete callback as the toolbar and footer
		for the current view. This allows you to do special things to the navigation. By default, JBrowser
		injects the contents of this toolbar into the area above the content and the footer content into
		the footer. By simply putting links and other elements into a div with the class "toolbar" it 
		will be added to the header (and the same for the footer).
		You must include the toolbar / footer in every response for it to remain there.
	*/
	renderContent: function(options){
		var content = {};
		if ($(options.content)) {
			//if the content is an element, cast it into an Elements array
			content.elements = $$($(options.content));
		} else if ($type(options.content) == "string") {
			//if it's a string, parse it
			content = this._parseContent(options.content);
		} else {
			//the only other valid option is that it's an array of elements, 
			//cast it into an Elements array in case it's just a vanilla array
			content.elements = $$(options.content);
		}
		
		//determine view and view element
		var view, viewElement = content.elements.filter('.view')[0] || content.elements.getElement('.view')[0];
		if (viewElement) {
			view = viewElement.get('id');
			viewElement.set('id', '');
			content.view = view;
			content.viewElement = viewElement;
		}
		this._applyRenderers(content, options);

	},

	resize: function(x, y){
		this.element.setStyles({
			width: 'auto',
			height: y
		});
		this.currentSize = {
			x: x,
			y: y
		};
		this.fireEvent('resize', [x, y]);
	},

	filters: {},

	/*
		addFilter:
		name - (*string*) the unique name of the filter
		fn - (*function*) callback executed
	*/

	addFilter: function(name, fn){
		this.filters[name] = fn;
		return this;
	},

	/*
		addFilters
		obj - (*object*) a key/value set of filters to add
	*/
	addFilters: function(obj){
		$each(obj, function(fn, name){
			this.addFilter(name, fn);
		}, this);
		return this;
	},

	/*
		applyFilters:
		container - (*element*) applies all the filters on this instance of jFrame to the contents of the container.
		content - (*object*) optional object containing various metadata about the content; js tags, meta tags, title, view, etc. See the "notes" section of the renderContent method comments in this file.
		
	*/

	applyFilters: function(container, content){
		for (name in this.filters) {
			this.applyFilter(name, container, content);
		}
	},


	/*
		applyFilter:
		name - (*string*) the name of the JFrame filter to apply
		container - (*element*) applies all the filters on this instance of jFrame to the contents of the container.
		content - (*object*) optional object containing various metadata about the content; js tags, meta tags, title, view, etc. See the "notes" section of the renderContent method comments in this file.
		
	*/
	applyFilter: function(name, container, content){
		dbug.conditional(this.filters[name].bind(this, [container, content]), function(e) {
			dbug.log('filter failed, name %s, error: ', name, e);
		});
	},

	marked: [],
	
	/*
		marks a function to execute when the jFrame is unloaded (before new content is loaded)
		fn - (*function*) the function to mark. Executed only once.
	*/
	markForCleanup: function(fn) {
		this.marked.push(fn);
	},

	/*
		linkers are custom event handlers for links that match a specific selector. Ideally, the selector is just a classname.
		When any link in a jFrame is clicked, it is checked against all registered linkers. If no matches are found, the link 
		is handled by jFrame and loads new content. If there is a match, the matcher's function handles the event.
		selector - (*string*) a css selector that the link is tested against.
		fn - (*function*) callback that handles links that match the selector
		
		example:
		
		//when any link with the class .alert is clicked, alert its href:
		myjFrame.addLinker('.alert', function(event, link) {
			event.preventDefault();
			alert(link.get('href'));
		});
	*/
	addLinker: function(selector, fn){
		this.linkers[selector] = fn;
		return this;
	},

	/*
		addLinkers:
		add a group of linkers
		obj - (*object*) a key/value set of linkers
	*/
	addLinkers: function(obj){
		$each(obj, function(fn, selector){
			this.addLinker(selector, fn);
		}, this);
		return this;
	},


	/*
		invokeLinker:
		invokes a specific linker to handle an event (allows you to manually fire a click for a specific linker)
		selector - (*string*) a css selector that maps to the linker
		element - (*element*) the element that will have fired the event
		event - (*event; optional*) the event object to pass along
	*/

	invokeLinker: function(selector, element, event){
		dbug.conditional(this.linkers[selector].bind(this, [event, element]), function(e) {
			dbug.log('linker failed, selector %s, error: ', selector, e);
		});
	},

	/*
		addRenderer: adds an renderer to this instance
		name - (*string*) a unique name for this renderer
		fn - (*function*) method, passed the contents (see renderer method above), that may handle those contents if it chooses
		
		To remove an renderer, overwrite it thusly:
		
		myJFrame.addRenderer('rendererToRemove', $empty);
	*/

	addRenderer: function(name, fn) {
		this._renderers[name] = fn;
	},

	/*
		addRenderers: adds a group of renderers
		obj - (*object*) a key/value set of renderers.
	*/

	addRenderers: function(obj) {
		$each(obj, function(fn, name) {
			this.addRenderer(name, fn);
		}, this);
	},

	/*
		destroy: removes the jframe element and cleans up any events that may be attached
	*/

	destroy: function(){
		this._sweep();
	},


/****************************************************************************************
	PRIVATE METHODS BELOW
*****************************************************************************************/

	/*
		_parseContent
		html - (*string*) given a string of html, return the js, css links, and body>elements, etc based on the content parsers.
	*/

	_parseContent: function(html) {
		var data = {
			html: html
		};
		for(parser in this._contentParsers) {
			this._contentParsers[parser].call(this, data);
		}
		return data;
	},

	_contentParsers: {
		scripts: function(data) {
			//get the inline scripts, take their js out, and remove them from the html
			var js;
			data.html = data.html.stripScripts(function(script){
				js += script;
			});
			data.js = js;
		},
		styles: function(data) {
			//get all the link and style tags, remove them from the html
			data.links = Elements.from(data.html.getTags('links').join(' '));
			data.links = data.links.filter('[rel=stylesheet]');
			data.links.concat(Elements.from(data.html.getTags('style').join(' ')));
			data.html = data.html.stripTags('links');
		},
		title: function(data) {
			//grab the title value
			data.title = this._getTitleFromHTML(data.html);
		},
		meta: function(data) {
			//grab any meta tags and remove them from the html
			data.meta = Elements.from(data.html.getTags('meta').join(' '));
			data.html = data.html.stripTags('meta');
		},
		elements: function(data) {
			//grab the contents of the body tag
			data.elements = Elements.from(data.html.getTags('body', true)[0] || data.html);
		}
	},

	/*
		fill: fills a given target with the appropriate content
		target - (*element*) the target to fill with content
		content - (*object*) an object with the following properties:
			
			js - (*string*) any the inline javascript to evalutate,
			links - (*elements array*) css links to be injected into the target
			elements - (*elements array*) elements to inject into the target (i.e. the actual content)
			title - (*string*) the title of the content
			view - (*string*; optional) if defined, the view of the content
			viewElement - (*element*; optional) if defined, the element for the view
		
	*/

	fill: function(target, content){
		target.empty().adopt(content.elements);
		if (content.links && content.links.length && this.options.includeLinkTags) target.adopt(content.links);
		if (this.options.evaluateJs && content.js) $exec(content.js);
		this.applyDelegates(target);
		this.applyFilters(target, content);
	},

	/*
		options:
			see renderContent
	*/
	_setRequestOptions: function(request, options) {
		request.setOptions($merge({
			useSpinner: this.options.spinnerCondition.apply(this, [options]),
			spinnerTarget: this.options.spinnerTarget || this.element,
			spinnerOptions: { fxOptions: {duration: 200} },
			onFailure: this.error.bind(this),
			onRequest: function(){
				if (this._request) this._request.cancel();
				this._request = request;
			}.bind(this),
			onSuccess: function(requestTxt){
				this._requestSuccessHandler(request, requestTxt, options);
				this._request = null;
			}.bind(this),
			onCcsErrorPopup: function(alert){
				alert.addEvent('destroy', function(){
					if (!this.loadedOnce) {
						var win = this.getWindow();
						if (win) win.hide();
					}
				}.bind(this));
			}.bind(this)
		}, options));
		request.setHeader('X-Hue-JFrame', 'true');
	},

	_checkForEmptyErrorState: function(request, html){
		return this.options.errorDetector(request, html) || false;
	},

	_requestSuccessHandler: function(request, html, options) {
		var error, blankWindowWithError;
		if (this._checkForEmptyErrorState(request, html)) {
			serverSideError = true;
			if (!this.loadedOnce) blankWindowWithError = true;
		}
		var responsePath = request.getHeader('X-Hue-JFrame-Path');
		var redirected = responsePath && responsePath != this.currentPath;

		if (redirected) this.fireEvent('redirect', [this.currentPath, responsePath]);
		
		this.renderContent($merge({
			content: html,
			responsePath: responsePath || request.options.url,
			error: error,
			blankWindowWithError: blankWindowWithError
		}, options || {}));
		var flash = request.getHeader('X-Hue-Flash-Messages');
		if (flash) {
			var data = eval(flash);
			data.each(function(msg) {
				CCS.Desktop.flashMessage(msg);
			});
		}
		if (redirected) this.fireEvent('redirectAfterRender', [this.currentPath, responsePath]);
	},

	/*
		given an HTML string, find the contents of the <title> tag or the first <h1>
	*/

	_getTitleFromHTML: function(html){
		var title = html.getTags('title', true);
		if (!title.length) title = html.getTags('h1', true);
		if (title.length) return title[0].stripTags();
		return '';
	},

	/*
		checks the link clicked to see if it matches the selectors in any linkers.
		returns true if any were found. This allows for custom link handling; by default
		links load their contents into the jFrame (unless their link hrefs are not on the
		same domain; in that case, they are loaded in a new tab/window).
	*/
	_checkLinkers: function(event, link){
		var linked;
		for (selector in this.linkers) {
			if (link.match(selector)) {
				linked = true;
				this.invokeLinker(selector, link, event);
			}
		}
		return linked;
	},
	
	/*
		default error handler for jframe; passes to CCS.error...
	*/
	
	error: function(message){
		//TODO(nutron) insert some sort of logging report when this happens
		this.fireEvent('loadError');
	},

	/*
		filters:
		Filters are functions that are called every time the contents of the jFrame is updated. 
		The method defined is passed the container and can then apply its own logic to the contents
		of that container. The name specified is not used, except that you can overwrite a filter
		by using the same name.
		
		example: images links with class "alert" shall allert their source url:
		
			myjFrame.addFilter('alerts', function(container){
				var alerter = function(){
					alert(img.get('alt'));
				};
				var imgs = container.getElements('img');
				imgs.addEvent('click', alerter);
				//this could be accomplished with delegation too of course; just an example
				
				//you can mark a function for execution when the jframe contents are cleaned up when new content is loaded:
				this.markForCleanup(function(){
					imgs.removeEvent('click', alerter);
				});
			});
	*/

	/*
		sweeps all marked functions.
	*/
	_sweep: function(){
		this.marked.each(function(fn) {
			dbug.conditional(fn.bind(this), function(e) {
				dbug.log('sweeper failed, error: ', e);
			});
		});
		this.marked.empty();
		//if there are any child widgets that were not destroyed, destroy them
		if (this._childWidgets.length) this._childWidgets.each(function(w) { w.eject(); });
	},

	/*
		_applyRenderers: renders content into the target
		content - (*object*) an object with the following props:
			html - (*string*) the source html, if it was present
			js - (*string*) any the inline javascript to evalutate,
			links - (*elements array*) css links and style tags to be injected into the target
			elements - (*elements array*) elements to inject into the target (i.e. the actual content)
			meta - (*elements array*) any meta tags from the content
			title - (*string*) the title of the content
			view - (*string*; optional) if defined, the view of the content
			viewElement - (*element*; optional) if defined, the element for the view
		
		Iterates over all the renderers for this instance (including global renderers on the JFrame prototype, which
		includes the default renderer). Each renderer may inspect the content and elect to handle it instead of the 
		default handler. If it handles it and wishes to prevent the default handler, the renderer returns *true*, 
		otherwise, if it returns *false* (or nothing) the default handler will fill the contents and set up events
		and filters, linkers, etc. as usual.
	*/

	_applyRenderers: function(content, options){
		var rendered;
		this.fireEvent('beforeRenderer', [content, options]);
		//loop through all the renderers
		$H(this._renderers).some(function(renderer, name){
			//except the default one
			dbug.conditional(function(){
				rendered = renderer.call(this, content, options);
			}.bind(this), function(e) {
				dbug.log('renderer failed: name %s, error: ', e);
			});
			return rendered;
		}, this);
		//if no renderers returned true, then call the default one
		if (!rendered) {
			dbug.conditional(this._defaultRenderer.bind(this, [content, options]), function(e){
				dbug.log('default renderer failed, error: ', e);
			});
		}
		this.fireEvent('afterRenderer', [content, options]);
	},

	/*
		renderers:
		a key/value set of renderers; see _applyRenderers above
	*/
	_renderers: {},
	
	/*
		the default renderer, if no other renderers apply
		this is the default behavior for jframe which fills the content of the window and updates 
		the history (if history is enabled). It also picks out the view if there is one defined
		as well as assigns the toolbar to the callback object for JBrowser to do with it what it will.
		Finally, it calls the callback in the options (if specified) and fires the loadComplete event.
	*/
	_defaultRenderer: function(content, options){
		//store the path as the current one
		this.currentPath = options.responsePath || this.currentPath;
		//grab the target
		var target = options.target ? $$(options.target)[0] || this.content : this.content;
		this._resetOverflow(target);

		//if we're injecting into the main content body, cleanup and scrollto the top
		if (target == this.content) {
			this.scroller.toTop();
			this._sweep();
		}

		//if we're injecting into the main content body apply the view classes and remove the old one
		if (target == this.content) {
			if (this.view) this.content.removeClass(this.view.view);
			if (content.viewElement) {
				this.view = {
					view: content.view,
					element: content.viewElement,
					target: target
				};
				target.addClass(content.view);
			}
		}


		//fill the target
		this.fill(target, content);

		//see if the content has a toolbar in it
		var toolbar = target.getElements('.toolbar');
		var footer = target.getElements('.footer');

		//define the callback data
		var data = {
			content: options.content,
			responsePath: options.responsePath,
			title: content.title || options.title || options.responsePath,
			userData: options.userData,
			view: content.view,
			viewElement: content.viewElement,
			target: target,
			toolbar: toolbar,
			footer: footer,
			suppressHistory: options.suppressHistory
		};

		// Let observers know
		if (!options.suppressLoadComplete) this.fireEvent('loadComplete', data);
		if (options.callback) options.callback(data);
		this.loadedOnce = true;
	},
	
	_resetOverflow: function(target) {
		//reset the overflow style for those filters which alter the content
		//such as splitview, etc.:
		target.setStyle('overflow', '');
	}

});

/****************************************************************************************
	PUBLIC STATIC METHODS BELOW
*****************************************************************************************/

/*
	Static method: CCS.JFrame.addGlobalLinkers
	Adds a group of linkers to all instances of JFrame.
	linkers - (*object*) a key/value set of linkers
*/
CCS.JFrame.addGlobalLinkers = function(linkers) {
	CCS.JFrame.implement({
		linkers: linkers
	});
};
/*
	Static method: CCS.JFrame.addGlobalFilters
	Adds a group of filters to all instances of JFrame.
	filters - (*object*) a key/value set of filters
*/
CCS.JFrame.addGlobalFilters = function(filters) {
	CCS.JFrame.implement({
		filters: filters
	});
};

/*
	Static method: CCS.JFrame.addGlobalRenderers
	Adds a group of renderers to all instances of JFrame.
	renderers - (*object*) a key/value set of renderers
*/
CCS.JFrame.addGlobalRenderers = function(renderers) {
	CCS.JFrame.implement({
		_renderers: renderers
	});
};
