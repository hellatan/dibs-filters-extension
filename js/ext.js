(function () {
    var $ = Sizzle;
    var githubUriPR = 'https://github.com/pulls';
    var jiraDomain =  'https://1stdibs.atlassian.net';
    // jira's query system is a real piece of shit to program against
    var jiraIssues = '{jiraDomain}/issues/?jql=';
    var jiraTicket = '{jiraDomain}/browse/{ticket}';
    var jiraFilterOrder = ['fixVersion', 'assignee', 'order'];
    var jiraOriginals = {
        'fixVersion': 'fixVersion = {fixVersion}',
        'assignee': 'AND assignee in ({assignees})',
        'order': 'ORDER BY status ASC'
    };
    var jiraFilters = {
        'fixVersion': jiraOriginals.fixVersion,
        'assignee': jiraOriginals.assignee,
        'order':jiraOriginals.order
    };
    var ghOrg = '1stdibs';
    var ghUserName = '';
    var filters = {
        'is': 'is',
        'user': 'user',
        'milestone': 'milestone',
        'userName': 'author'
    };
    var decimalRegexp = /^\d{1,2}(\.\d{1,2})+$/;
    var jiraTicketRegexp = /^\w-\d{1,6}$/;
    var defaultTabOnOpen;
    var helpers;
    var elHelpers;
    var validationHelpers;
    var filterSets;

    if (chrome && chrome.storage) {
        // having this in a conditional makes the
        // browser not crash when running jasmine tests
        chrome.storage.sync.get(['jiraDomain', 'defaultTab', 'ghOrg', 'ghUserName'], function (items) {
            jiraDomain = items.jiraDomain || jiraDomain;
            jiraIssues = jiraIssues.replace('{jiraDomain}', jiraDomain);
            jiraTicket = jiraTicket.replace('{jiraDomain}', jiraDomain);
            defaultTabOnOpen = items.defaultTab;
            ghOrg = items.ghOrg || ghOrg;
            ghUserName = items.ghUsername;
        });
    } else {
        jiraIssues = jiraIssues.replace('{jiraDomain}', jiraDomain);
        jiraTicket = jiraTicket.replace('{jiraDomain}', jiraDomain);
    }

    function resetJiraFilters() {
        for (var i in jiraOriginals) {
            if (jiraOriginals.hasOwnProperty(i)) {
                jiraFilters[i] = jiraOriginals[i];
            }
        }
    }

    helpers = {
        toggleTab: function (el, id) {
            var $tab = $('#' + id + 'Tab');
            if ($tab.length) {
                if (!$tab[0].classList.contains('is-current')) {
                    this.removeCurrent(el, id);
                    $tab[0].classList.add('is-current');
                }
            }
        },
        removeCurrent: function (el, id) {
            var $tabs = $('.tab');

            $('.' + el.className).map(function (element) {
                if (element.href.indexOf(id) === -1) {
                    element.classList.remove('is-current');
                    element.parentNode.classList.remove('is-current');
                } else {
                    element.classList.add('is-current');
                    element.parentNode.classList.add('is-current');
                }
            });

            $tabs.forEach(function (element) {
                if (element.classList && element.classList.contains('is-current')) {
                    element.classList.remove('is-current');
                }
            });
        },
        filterValue: function (e, type) {
            type = (type || '').toLowerCase();
            if (type === 'milestone') {
                return this.filterMilestone(e);
            } else if (type === 'fixversion') {
                return this.filterFixVersion(e);
            } else if (type === 'jiraticket') {
                return this.filterJiraTicket(e);
            }
        },
        filterFixVersion: function (e) {
            e.preventDefault();
            filterSets.fixVersionFilter();
            return false;
        },
        filterMilestone: function (e) {
            e.preventDefault();
            filterSets.milestonePRs();
            return false;
        },
        filterJiraTicket: function (e) {
            e.preventDefault();
            filterSets.jiraTicketFilter();
            return false;
        },
        createFilterUrl: function (uri, values) {
            var ret = uri;
            if (Array.isArray(values)) {
                values = encodeURIComponent(values.join(' '));
                ret += '?q=' + values;
            }
            return ret;
        },
        goToUrl: function (url) {
            window.open(url);
        }
    };

    elHelpers = {
        getEl: function (el) {
            return $(el);
        },
        getFixVersion: function () {
            return this.getEl('#formFixVersionInput')
        },
        getMilestone: function () {
            return this.getEl('#formMilestoneInput')
        },
        getStatus: function () {
            return this.getEl('#formStatus > .input-label-radio > input[type=radio]');
        },
        getGhUserName: function () {
            return this.getEl('#formUserNameInput');
        },
        getJiraAssignee: function () {
            return this.getEl('#formAssigneeInput');
        },
        getJiraTicket: function () {
            return this.getEl('#formJiraTicketInput');
        },
        getFixVersionValue: function () {
            var $el = this.getFixVersion();
            return $el.length ? $el[0].value : '';
        },
        getJiraAssigneeValue: function () {
            var $el = this.getJiraAssignee();
            return $el.length ? $el[0].value : '';
        },
        getJiraTicketValue: function () {
            var $el = this.getJiraTicket();
            return $el.length ? $el[0].value : '';
        },
        getMilestoneValue: function () {
            var $el = this.getMilestone();
            return $el.length ? $el[0].value : '';
        },
        getStatusValue: function () {
            var $radios = this.getStatus();
            var value = $radios.filter(function (item) {
                return item.checked === true;
            });
            return value.length ? value[0].value : ''
        },
        getGhUserNameValue: function () {
            var $el = this.getGhUserName();
            return $el.length ? $el[0].value : '';
        },
        showError: function (err) {
            var $el;
            switch (err.toLowerCase()) {
                case 'milestone':
                    $el = this.getMilestone();
                    break;
                case 'status':
                    $el = this.getStatus();
                    break;
                case 'fixversion':
                    $el = this.getFixVersion();
                    break;
                case 'jiraticket':
                    $el = this.getJiraTicket();
                    break;
            }
            if ($el.length) {
                $el[0].parentNode.classList.add('err');
            }
        },
        removeError: function (err) {
            switch (err.toLowerCase()) {
                case 'milestone':
                    $el = this.getMilestone();
                    break;
                case 'status':
                    $el = this.getStatus();
                    break;
                case 'fixversion':
                    $el = this.getFixVersion();
                    break;
                case 'jiraticket':
                    $el = this.getJiraTicket();
                    break;
            }
            if ($el.length) {
                $el[0].parentNode.classList.remove('err');
            }
        }
    };

    validationHelpers = {
        milestone: function () {
            var milestone = elHelpers.getMilestoneValue();
            var validMilestone = this.handleMilestoneState(milestone);
            if (!validMilestone) {
                return false;
            }
            return {
                value: milestone
            };
        },
        status: function () {
            var status = elHelpers.getStatusValue();
            var validStatus = this.handleStatusState(status);
            if (!validStatus) {
                return false;
            }
            return {
                value: status
            }
        },
        ghUserName: function () {
            return {
                value: elHelpers.getGhUserNameValue()
            }
        },
        fixVersion: function () {
            var fixVersion = elHelpers.getFixVersionValue();
            var validFixVersion = this.handleFixVersionState(fixVersion);
            if (!validFixVersion) {
                return false;
            }
            return {
                value: fixVersion
            }
        },
        jiraAssignee: function () {
            // not required field
            return {
                value: elHelpers.getJiraAssigneeValue()
            }
        },
        jiraTicket: function () {
            var jiraTicket = elHelpers.getJiraTicketValue();
            var validJiraTicket = this.handleJiraTicketState(jiraTicket);
            if (!validJiraTicket) {
                return false;
            }
            return {
                value: jiraTicket
            }
        },
        handleMilestoneState: function (milestone) {
            if (!milestone || !decimalRegexp.test(milestone)) {
                elHelpers.showError('milestone');
                return false;
            }
            elHelpers.removeError('milestone');
            return true;
        },
        handleStatusState: function (status) {
            if (!status) {
                elHelpers.showError('status');
                return false;
            }
            elHelpers.removeError('status');
            return true;
        },
        handleFixVersionState: function (fixVersion) {
            if (!fixVersion || !decimalRegexp.test(fixVersion)) {
                elHelpers.showError('fixVersion');
                return false;
            }
            elHelpers.removeError('fixVersion');
            return true;
        },
        handleJiraTicketState: function (ticket) {
            if (!ticket || jiraTicketRegexp.test(ticket)) {
                elHelpers.showError('jiraTicket');
                return false;
            }
            elHelpers.removeError('jiraTicket');
            return true;
        }
    };

    filterSets = {
        milestonePRs: function () {
            var milestone = validationHelpers.milestone();
            var status = validationHelpers.status();
            var userName = validationHelpers.ghUserName();
            var filterValues = {};
            var qsVals = [];
            var url;
            if (milestone && status) {
                filterValues[filters.user] = ghOrg;
                filterValues[filters.is] = status.value;
                filterValues[filters.milestone] = milestone.value;
                if (userName.value) {
                    filterValues[filters.userName] = userName.value;
                }
                Object.keys(filterValues).forEach(function (key) {
                    var filter = key + ':' + filterValues[key];
                    qsVals.push(filter);
                });
                url = helpers.createFilterUrl(githubUriPR, qsVals);
                helpers.goToUrl(url);
            }
        },
        fixVersionFilter: function () {
            var fixVersionInfo = validationHelpers.fixVersion();
            var assigneeInfo = this.assigneeFilter();
            var localJiraFilterOrder = jiraFilterOrder.slice(0);
            var qp = [];
            var url;
            if (fixVersionInfo) {
                jiraFilters.fixVersion = jiraFilters.fixVersion.replace('{fixVersion}', fixVersionInfo.value);
                if (assigneeInfo && assigneeInfo.value) {
                    jiraFilters.assignee = jiraFilters.assignee.replace('{assignees}', assigneeInfo.value);
                } else {
                    localJiraFilterOrder.splice(jiraFilterOrder.indexOf('assignee'), 1);
                }
                localJiraFilterOrder.forEach(function (item) {
                    qp.push(jiraFilters[item]);
                });
                url = jiraIssues + encodeURIComponent(qp.join(' '));
                resetJiraFilters();
                helpers.goToUrl(url);
            }
        },
        assigneeFilter: function () {
            return validationHelpers.jiraAssignee();
        },
        jiraTicketFilter: function () {
            var jiraTicketInfo = validationHelpers.jiraTicket();
            var url;
            if (jiraTicketInfo) {
                url = jiraTicket.replace('{ticket}', jiraTicketInfo.value);
                helpers.goToUrl(url);
            }
        }
    };

    function convertToArray(obj) {
        return [].map.call(obj, function(element) {
            return element;
        })
    }

    function updateDefaultTab(tabs, target) {
        tabs.forEach(function (element) {
            var link;
            if (element.nodeName === 'LI') {
                link = convertToArray(element.childNodes).filter(function (childEl) {
                    return childEl.nodeName === 'A';
                });
                if (link[0].href.indexOf(target) !== -1) {
                    link[0].click();
                }
            }
        });
    }

    function init() {
        document
            .getElementById('formMilestoneSearch')
            .addEventListener('click', function (e) {
                helpers.filterValue(e, 'milestone');
            });
        document
            .getElementById('formFixVersionSearch')
            .addEventListener('click', function (e) {
                helpers.filterValue(e, 'fixVersion');
            });
        document
            .getElementById('formJiraTicketSearch')
            .addEventListener('click', function (e) {
                helpers.filterValue(e, 'jiraTicket');
            });

        var tabs = document.querySelectorAll('.tab-toggle-list-item');

        if (tabs.length) {
            // convert tabs into an array
            // by default it is a NodeList
            tabs = convertToArray(tabs);

            tabs.forEach(function (element, index) {
                element.addEventListener('click', function (e) {
                    var cur = e.target;
                    helpers.toggleTab(cur, cur.href.split('#').pop());
                });
            });
            setTimeout(function () {
                if (defaultTabOnOpen) {
                    updateDefaultTab(tabs, defaultTabOnOpen);
                }
            }, 200);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        init();
    });

    window.helpers = helpers;

})();