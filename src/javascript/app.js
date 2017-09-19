Ext.define('TSModel', {
    extend: 'Ext.data.Model',
    fields: [
        { name: 'User', type:'string' },
        { name: 'Team', type:'string' },
        { name: 'FormattedID', type:'string' },
        { name: 'Name', type:'string' },
        { name: 'WorkProduct', type:'string' },
        { name: 'WorkProductID', type:'string' },
        { name: 'Release', type:'string' },
        { name: 'State', type:'string' },
        { name: 'PercentageUsedEstimate', type:'number' },
        { name: 'PercentageUsedToDo', type:'number' },
        { name: 'Capacity', type:'number' },
        { name: 'Estimate', type:'number' },
        { name: 'ToDo', type:'number' },
        { name: 'TimeSpent', type:'number' },
        { name: 'Actuals', type:'number' },
        { name: 'PercentageUsedActuals', type: 'number'}
    ]
});

Ext.define("TSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box', layout:'hbox', padding: 10},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "TSApp"
    },
    
    config: {
        defaultSettings: {
            selectorType: ''    
        }
    },                    

    getSettingsFields: function() {
        var me = this;
        var settings = [{
                name: 'showActuals',
                xtype: 'rallycheckboxfield',
                boxLabelAlign: 'after',
                fieldLabel: '',
                margin: '0 0 25 25',
                boxLabel: 'Show Actuals on Grid'
            }
            // ,
            // {
            //     name: 'showColorCodes',
            //     xtype: 'rallycheckboxfield',
            //     boxLabelAlign: 'after',
            //     fieldLabel: '',
            //     margin: '0 0 25 25',
            //     boxLabel: 'Show Color coding on Grid'
            // }            
            ];
        return settings;
    },


    launch: function() {
        var me = this;
        me._addSelector();        


    },
      
    _addSelector: function() {
        var me = this;
        var selector_box = this.down('#selector_box');
        selector_box.removeAll();
        selector_box.add({
            xtype:'rallyiterationcombobox',
            fieldLabel: 'Iteration:',
            width:500,
            margin:10,
            showArrows : false,
            context : this.getContext(),
            growToLongestValue : true,
            defaultToCurrentTimebox : true,
            listeners: {
                scope: me,
                change: function(icb) {
                    me.iteration = icb;
                    var user_filters = [{property:'TeamMemberships',value: me.getContext().getProject()._ref}, {property:'Disabled', operator:'!=' ,value: true}];
                    var user_config = {
                        model: 'User',
                        fetch: ['ObjectID','Name'],
                        filters: user_filters,
                        limit: 'Infinity'
                    };

                    me._loadAStoreWithAPromise(user_config).then({
                        success: function(results){
                            me.users = results;
                            console.log('Users for the current project',results);
                            me._queryAndDisplayGrid();
                        }
                    });
                }
            }
        });

         selector_box.add({
            xtype:'rallybutton',
            itemId:'export_button',
            text: 'Download CSV',
            margin:10,

            disabled: false,
            iconAlign: 'right',
            listeners: {
                scope: me,
                click: function() {
                    me._export();
                }
            },
            margin: '10',
            scope: me
        });

    },      

    _queryAndDisplayGrid: function(){
        var me = this;
        me.setLoading("Loading");

        var iteration_name = me.iteration.rawValue;

        var task_filters = Ext.create('Rally.data.wsapi.Filter', {
             property: 'Iteration.Name',
             operator: '=',
             value: iteration_name
        });

        var uic_user_filter = [];  
        var task_owner_filter = [];

        Ext.Array.each(me.users,function(user){
            uic_user_filter.push({property : 'User.ObjectID', value: user.get('ObjectID')});
        });

        Ext.Array.each(me.users,function(user){
            task_owner_filter.push({property : 'Owner.ObjectID', value: user.get('ObjectID')});
        });

        var task_config = {
            model: 'Task',
            fetch: ['ObjectID','FormattedID','Name','Project','State','Owner','WorkProduct','ToDo','TimeSpent','Release','Estimate','Actuals','Iteration','UserIterationCapacities','DisplayName',"FirstName",'LastName'],
            filters: Rally.data.wsapi.Filter.or(task_owner_filter).and(task_filters),
            context: {
                projectScopeUp: false
                ,
                project:null
            },
            compact: false,
            limit: 'Infinity'
        };

        var uic_config = {
            model: 'UserIterationCapacity',
            fetch: ['ObjectID','FormattedID','Name','Project','Iteration','Capacity','User','DisplayName',"FirstName",'LastName'],
            filters: Rally.data.wsapi.Filter.or(uic_user_filter).and(task_filters),
            context: {
                projectScopeUp: false
                ,
                project:null
            },
            compact: false,
            limit: 'Infinity'
        };

        Deft.Promise.all([me._loadAStoreWithAPromise(task_config),me._loadAStoreWithAPromise(uic_config)],me).then({
            scope: me,
            success: function(results) {

                //process results to create a custom grid. 

                var tasks = [];
                //var hash = {},
                var totalCapacity = 0;
                var totalEstimate = 0;
                var totalToDo = 0;
                var totalTimeSpent = 0;
                var totalActuals = 0;
                // me.logger.log('uic',results[1]);

                var uic_hash = {};
                //var teamExists = null;

                Ext.Array.each(me.users,function(user){
                    var userName = user.get('FirstName') || user.get('LastName') ? user.get('FirstName') + " " + user.get('LastName') : user.get('_refObjectName');
                    uic_hash[userName] = {
                            User: userName,
                            ObjectID: user.get('ObjectID'),
                            Projects:[]
                    };
                });
                
                console.log('All users>>', uic_hash);

                Ext.Array.each(results[1],function(uic){
                    var userName = uic.get('User')  ? (uic.get('User').FirstName || uic.get('User').LastName  ? uic.get('User').FirstName  + " " + uic.get('User').LastName  : uic.get('User')._refObjectName) : "No Owner Entry";
               
                    totalCapacity += uic.get('Capacity');
                    if(uic_hash[userName]){
                        uic_hash[userName].Projects.push({
                                        Project: uic.get('Project').Name,
                                        children:[],
                                        Capacity: uic.get('Capacity'),
                                        Estimate: 0,
                                        ToDo: 0,
                                        TimeSpent:0,
                                        Actuals: 0,
                                        PercentageUsedEstimate: 0,
                                        PercentageUsedToDo: 0,
                                        PercentageUsedActuals: 0
                                    });
                    }else{
                        uic_hash[userName] = {
                            User: userName,
                            ObjectID: uic.get('User').ObjectID,
                            Projects: [{
                                        Project: uic.get('Project').Name,
                                        children:[],
                                        Capacity: uic.get('Capacity'),
                                        Estimate: 0,
                                        ToDo: 0,
                                        TimeSpent:0,
                                        Actuals: 0,
                                        PercentageUsedEstimate: 0,
                                        PercentageUsedToDo: 0,
                                        PercentageUsedActuals: 0
                                    }]
                        };
                    }


                });

                me.uic_hash = uic_hash;
                // me.logger.log('uic_hash',uic_hash);

                Ext.Array.each(Ext.Object.getKeys(uic_hash),function(user){
                    tasks.push({
                        User: user,
                        children: me.uic_hash[user].Projects,
                        Capacity: 0,
                        Estimate: 0,
                        ToDo: 0,
                        TimeSpent: 0,
                        Actuals: 0,
                        PercentageUsedEstimate: 0,
                        PercentageUsedToDo: 0,
                        PercentageUsedActuals: 0
                    });
                });



                Ext.Array.each(results[0],function(task){

                    var userName = task.get('Owner')  ? ((task.get('Owner').FirstName ? task.get('Owner').FirstName : "" ) + " " + (task.get('Owner').LastName ? task.get('Owner').LastName.slice(0,1) : "" )) : "No Owner Entry";
                    if(" "==userName){
                        userName = task.get('Owner')._refObjectName;
                    }                    

                    totalToDo = totalToDo + (task.get('ToDo') > 0 ? task.get('ToDo'):0);
                    totalTimeSpent = totalTimeSpent + (task.get('TimeSpent') > 0 ? task.get('TimeSpent'):0);
                    totalEstimate = totalEstimate + (task.get('Estimate') > 0 ? task.get('Estimate'):0);
                    totalActuals = totalActuals + (task.get('Actuals') > 0 ? task.get('Actuals'):0);
                    var userName = task.get('Owner')  ? ((task.get('Owner').FirstName ? task.get('Owner').FirstName : "" ) + " " + (task.get('Owner').LastName ? task.get('Owner').LastName.slice(0,1) : "" )) : "No Owner Entry";
                    if(" "==userName){
                        userName = task.get('Owner')._refObjectName;
                    }
                    var capacity = 0;
                    Ext.Array.each(results[1],function(uic){
                        var task_oid = task.get('Owner') && task.get('Owner').ObjectID ? task.get('Owner').ObjectID:null;
                        var iteration_oid = task.get('Iteration') && task.get('Iteration').ObjectID ? task.get('Iteration').ObjectID:null;
                        if(task_oid == uic.get('User').ObjectID && iteration_oid == uic.get('Iteration').ObjectID){
                            capacity = uic.get('Capacity') ? uic.get('Capacity') : 0;
                        }
                    },me);

                    var userExists = null;
                    userExists = Ext.Array.filter(tasks, function(item) {
                        var teamExists = null;

                        if(item.User == userName){

                            teamExists = Ext.Array.filter(item.children, function(child) {
                                if(child.Team == task.get('Project').Name){
                                    child.children.push(me._getLeafNode(task));
                                    child.Estimate += task.get('Estimate');
                                    child.ToDo += task.get('ToDo');
                                    child.TimeSpent += task.get('TimeSpent');
                                    child.Actuals += task.get('Actuals');                                    
                                    child.Capacity = capacity;
                                    child.PercentageUsedEstimate = me._getPercentage(child.Estimate,capacity);
                                    child.PercentageUsedToDo = me._getPercentage(child.ToDo,capacity);
                                    child.PercentageUsedActuals = me._getPercentage(child.Actuals,capacity);
                                    return true;       
                                }
                            },me);

                            if(teamExists.length < 1){
                                item.children.push({
                                    Team: task.get('Project').Name,
                                    children: [me._getLeafNode(task)],
                                    Capacity: capacity,
                                    Estimate: task.get('Estimate'),
                                    ToDo: task.get('ToDo'),
                                    TimeSpent: task.get('TimeSpent'),
                                    Actuals: task.get('Actuals'),
                                    PercentageUsedEstimate: me._getPercentage(task.get('Estimate'),capacity),
                                    PercentageUsedToDo: me._getPercentage(task.get('ToDo'),capacity),
                                    PercentageUsedActuals: me._getPercentage(task.get('Actuals'),capacity)
                                });
                            }
                            item.Estimate += task.get('Estimate');
                            item.ToDo += task.get('ToDo');
                            item.TimeSpent += task.get('TimeSpent');
                            item.Actuals += task.get('Actuals');                          
                            item.Capacity = 0;
                            item.PercentageUsedEstimate = me._getPercentage(item.Estimate,item.Capacity); 
                            item.PercentageUsedToDo = me._getPercentage(item.ToDo,item.Capacity);
                            item.PercentageUsedActuals = me._getPercentage(item.Actuals,item.Capacity);
                            return true;                          
                        }
                    },me);

                    if(userExists.length < 1){

                        Ext.Array.each(me.uic_hash[userName] && me.uic_hash[userName].Projects,function(project){
                            if(project.Project == task.get('Project').Name){
                                project.children.push(me._getLeafNode(task));
                                project.Capacity = capacity;
                                project.Estimate = task.get('Estimate');
                                project.ToDo = task.get('ToDo');
                                project.TimeSpent = task.get('TimeSpent');
                                project.Actuals = task.get('Actuals');
                                project.PercentageUsedEstimate = me._getPercentage(task.get('Estimate'),capacity);
                                project.PercentageUsedToDo = me._getPercentage(task.get('ToDo'),capacity);
                                project.PercentageUsedActuals = me._getPercentage(task.get('Actuals'),capacity);
                            }
                        })
                        task = {
                            User: userName,
                            children: me.uic_hash[userName] && me.uic_hash[userName].Projects || [],
                            Capacity: 0,
                            Estimate: task.get('Estimate'),
                            ToDo: task.get('ToDo'),
                            TimeSpent: task.get('TimeSpent'),
                            Actuals: task.get('Actuals'),
                            PercentageUsedEstimate: me._getPercentage(task.get('Estimate'),capacity),                            
                            PercentageUsedToDo: me._getPercentage(task.get('ToDo'),capacity),                      
                            PercentageUsedActuals: me._getPercentage(task.get('Actuals'),capacity)                      
                        }    
                        tasks.push(task);                    
                    }

                });

                Ext.Array.each(tasks,function(team){
                    var team_capacity = 0;
                    Ext.Array.each(team.children,function(user){
                        team_capacity += user.Capacity;
                    })
                    team.PercentageUsedEstimate = me._getPercentage(team.Estimate,team_capacity);
                    team.PercentageUsedToDo = me._getPercentage(team.ToDo,team_capacity);
                    team.PercentageUsedActuals = me._getPercentage(team.Actuals,team_capacity);
                    team.Capacity = team_capacity;
                });

                me.topProject = "All - Totals";

                me.tasks = tasks;

                console.log('Tasks>',me.tasks);

                me._create_csv(totalCapacity,totalEstimate, totalToDo, totalTimeSpent, totalActuals );
                
                var store = Ext.create('Ext.data.TreeStore', {
                                model: 'TSModel',
                                root: {
                                    expanded: true,
                                    User: me.topProject,
                                    children: tasks,
                                    Capacity: totalCapacity,
                                    Estimate: totalEstimate,
                                    ToDo: totalToDo,
                                    TimeSpent: totalTimeSpent,
                                    Actuals: totalActuals,
                                    PercentageUsedEstimate: me._getPercentage(totalEstimate,totalCapacity),                                               
                                    PercentageUsedToDo: me._getPercentage(totalToDo,totalCapacity),
                                    PercentageUsedActuals: me._getPercentage(totalActuals,totalCapacity)                                  
                                },
                                sorters:[{
                                    property:'PercentageUsedEstimate',
                                    direction:'DESC'
                                }]
                            });

                me._displayGridNew(store);
                me.setLoading(false);                
            },
            failure: function(error_message){
                alert(error_message);
            }
        }).always(function() {
            me.setLoading(false);
        });

    },

    _getLeafNode:function(task){
        return {                    
                    Name: task.get('Name'),
                    FormattedID: task.get('FormattedID'),
                    WorkProduct: task.get('WorkProduct').Name,
                    WorkProductID: task.get('WorkProduct').FormattedID,
                    Release: task.get('WorkProduct').Release && task.get('WorkProduct').Release.Name,
                    State: task.get('State'),
                    Estimate: task.get('Estimate'),
                    ToDo: task.get('ToDo'),
                    TimeSpent: task.get('TimeSpent'),
                    Actuals: task.get('Actuals'),
                    leaf: true
                }
    },


    _getPercentage: function(value,capacity){
        var result = 0;
        if(capacity > 0){
            result = Math.round((value/capacity)*100);
        }
        return result;
    },

    //hash = {"Team": { project, Users: [User:{Name: name,Tasks:[task1,task2] }]}} :TODO

    _loadAStoreWithAPromise: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        //this.logger.log("Starting load:",model_name,model_fields);
          
        Ext.create('Rally.data.wsapi.Store', config).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);                        
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },

     _displayGridNew: function(store){
        var me = this
        me.down('#display_box').removeAll();

        var grid = {
            xtype:'treepanel',
            itemId: 'teamTreeGrid',
            store: store,
            cls: 'rally-grid',
            columns: me._getColumns(),
            scroll: true,
            autoScroll:true,
            style: {
                 "border": '1px solid black'
            },
            rootVisible: true
        };

        me.down('#display_box').add(grid);
        me.down('#teamTreeGrid').expandAll();
    },

    _getColumns: function(){
        var me = this;
        var columns =  [
                        {
                            xtype:'treecolumn',
                            text: 'User', 
                            dataIndex: 'User',
                            flex: 3
                        },
                        {
                            text: 'Team', 
                            dataIndex: 'Team',
                            flex: 3
                        },
                        {
                            text: 'US ID', 
                            dataIndex: 'WorkProductID',
                            flex: 1
                        },
                        {
                            text: 'US Name', 
                            dataIndex: 'WorkProduct',
                            flex: 3
                        },                        {
                            text: 'Task ID', 
                            dataIndex: 'FormattedID',
                            flex: 1
                        },
                        {
                            text: 'Task Name', 
                            dataIndex: 'Name',
                            flex: 3
                        },
                        {
                            text: 'Task State', 
                            dataIndex: 'State',
                            flex: 2
                        },                        
                        {
                            text: 'Release', 
                            dataIndex: 'Release',
                            flex: 2
                        },
                        {
                            text: 'Capacity',
                            dataIndex:'Capacity',
                            renderer: function(Capacity,metaData,record){
                                if(record.get('Team') == me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                                }                                
                                if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                                }
                                if(record.get('User')!=""){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                                }
                                if(record.get('leaf')){
                                    return ""
                                }else{
                                    return Capacity //> 0 ? Capacity:"";
                                }
                            },
                            flex: 1                        
                        },
                        {
                            text: 'Estimate',
                            dataIndex: 'Estimate',
                            renderer: function(Estimate,metaData,record){
                                if(record.get('Team') == me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                                }                                
                                if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                                }
                                if(record.get('User')!=""){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                                }                                   
                                return Estimate // > 0 ? Estimate:"";
                            },
                            flex: 1
                        },
                        {
                            text: 'To Do',
                            dataIndex: 'ToDo',
                            renderer: function(ToDo,metaData,record){
                                if(record.get('Team') == me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                                }                                
                                if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                                }
                                if(record.get('User')!=""){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                                }                                   
                                return ToDo //> 0 ? ToDo:0;
                            },
                            flex: 1
                        },
                        {
                            text: 'Time Spent',
                            dataIndex: 'TimeSpent',
                            renderer: function(TimeSpent,metaData,record){
                                if(record.get('Team') == me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                                }                                
                                if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                                }
                                if(record.get('User')!=""){
                                    metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                                }                                   
                                return TimeSpent //> 0 ? ToDo:0;
                            },
                            flex: 1
                        }
                        // ,{
                        //     text: '% Used <BR>(Estimate)',
                        //     dataIndex: 'PercentageUsedEstimate',
                        //     renderer: function(PercentageUsedEstimate,metaData,record){
                        //         if(record.get('Team') == me.context.getProject().Name ){
                        //             metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                        //         }                                
                        //         if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                        //             metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                        //         }
                        //         if(record.get('User')!=""){
                        //             metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                        //         }                              
                        //         return PercentageUsedEstimate + '%';
                        //     },
                        //     flex: 1
                        // },
                        // {
                        //     text: '% Used <BR>(To Do)',
                        //     dataIndex: 'PercentageUsedToDo',
                        //     renderer: function(PercentageUsedToDo,metaData,record){
                        //         if(record.get('Team') == me.context.getProject().Name ){
                        //             metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                        //         }                                
                        //         if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                        //             metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                        //         }
                        //         if(record.get('User')!=""){
                        //             metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                        //         }                              
                        //         return PercentageUsedToDo  + '%';
                        //     },
                        //     flex: 1
                        // }
            ];

            if(me.getSetting('showActuals')){
                columns.push({
                    text: 'Actuals',
                    dataIndex: 'Actuals',
                    renderer: function(Actuals,metaData,record){
                        if(record.get('Team') == me.context.getProject().Name ){
                            metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                        }                                
                        if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                            metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                        }
                        if(record.get('User')!=""){
                            metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                        }                                   
                        return Actuals //> 0 ? ToDo:0;
                    },
                    flex: 1
                });

                // columns.push({
                //             text: '% Used <BR>(Actuals)',
                //             dataIndex: 'PercentageUsedActuals',
                //             renderer: function(PercentageUsedActuals,metaData,record){
                //                 if(record.get('Team') == me.context.getProject().Name ){
                //                     metaData.style = 'font-weight: bold;font-style: italic;background-color:#A9A9A9;';                                
                //                 }                                
                //                 if(record.get('Team')!="" && record.get('Team') != me.context.getProject().Name ){
                //                     metaData.style = 'font-weight: bold;font-style: italic;background-color:#C0C0C0;';                                
                //                 }
                //                 if(record.get('User')!=""){
                //                     metaData.style = 'font-weight: bold;font-style: italic;background-color:#D3D3D3;';                                
                //                 }                              
                //                 return PercentageUsedActuals  + '%';
                //             },
                //             flex: 1
                //         });
            }

            return columns;
    },


    _export: function(){
        var me = this;
        if ( !me.tasks ) { return; }
        
        var filename = Ext.String.format('team_status_by_team.csv');

        Rally.technicalservices.FileUtilities.saveCSVToFile(me.CSV,filename);
    },

    _create_csv: function(totalCapacity,totalEstimate, totalToDo, totalTimeSpent, totalActuals){
        var me = this;

        totals = {
            Team: me.topProject,
            Capacity: totalCapacity,
            Estimate: totalEstimate,
            ToDo: totalToDo,
            TimeSpent: totalTimeSpent,
            Actuals: totalActuals,
            PercentageUsedEstimate: me._getPercentage(totalEstimate,totalCapacity),
            PercentageUsedToDo: me._getPercentage(totalToDo,totalCapacity),
            PercentageUsedActuals: me._getPercentage(totalActuals,totalCapacity)                                              
        }

        if ( !me.tasks ) { return; }
        
        me.setLoading("Generating CSV");

        var CSV = "";    
        var row = "";
        // Add the column headers
        var columns = [];
        Ext.Array.each(me._getColumns(),function(col){
            row += col.text.replace("<BR>","") + ',';
            columns.push(col.dataIndex);
        })

        CSV += row + '\r\n';

        //Write the totals row.
        row = "";

        Ext.Array.each(columns,function(col){
            row += totals[col] ? totals[col] + ',':',';
        },me)
        CSV += row + '\r\n';
        // Loop through tasks hash and create the csv 
        Ext.Array.each(me.tasks,function(task){
            row = "";
            Ext.Array.each(columns,function(col){
                row += task[col] ? task[col] + ',':',';
            },me)
            CSV += row + '\r\n';

            if(task.children && task.children.length > 0){
                Ext.Array.each(task.children,function(child){
                    row = "";
                    Ext.Array.each(columns,function(col){
                        row += child[col] ? child[col] + ',':',';
                    },me)
                    CSV += row + '\r\n';

                    if(child.children && child.children.length > 0){
                        Ext.Array.each(child.children,function(gchild){
                            row = "";
                            Ext.Array.each(columns,function(col){
                                if(col == "Name" || col == "WorkProduct"){
                                    row += gchild[col] ? '"' + gchild[col].replace(/"/g, '""') + '"' + ',':',';
                                }else{
                                    row += gchild[col] ? gchild[col] + ',':',';
                                }
                            },me)
                            CSV += row + '\r\n';                             
                        });
                    }
                },me);
            }
        },me);

        me.CSV = CSV;
        me.setLoading(false);
        //me.logger.log(CSV);
    },

    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
