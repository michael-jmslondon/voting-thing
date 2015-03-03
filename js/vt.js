(function () {
  'use strict';

  //<editor-fold desc="Custom knockout bindings">
  ko.bindingHandlers.jqmRefreshList = {
    update: function (element, valueAccessor) {
      ko.utils.unwrapObservable(valueAccessor()); // make this update fire each time the array is updated.
      $(element).listview('refresh');
    }
  };

  ko.bindingHandlers.jqmRefreshCheckBoxRadio = {
    init: function (element, valueAccessor) {
      $(element).controlgroup();
      $('input[type="radio"]', element).on('checkboxradiocreate', function (event, ui) {
        $(element).checkboxradio('refresh');
      });
    }
  };

  ko.bindingHandlers.jqmRefreshSlider = {
    init: function (element, valueAccessor) {
      $(element).slider();
      //$(element).on('slidecreate', function () {
      //  $(element).slider('refresh');
      //});
    }
  };
  //</editor-fold>

  var
    deviceReady = false,
    domReady = false;

  // APP_EXCLUDE_START
  deviceReady = true;
  // APP_EXCLUDE_END
  // WEB_EXCLUDE_START
  document.addEventListener('deviceready', function () {
    deviceReady = true;
    init();
  }, false);
  document.addEventListener('resume', function () {

  }, false);
  // WEB_EXCLUDE_END

  $(function () {
    domReady = true;
    init();
  });

  function init () {

    if (!deviceReady || !domReady) {
      return;
    }

    var entityMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    };

    function escapeHtml (string) {
      return String(string).replace(/[&<>"]/g, function (s) {
        return entityMap[s];
      });
    }

    var
      myData = {
        room: location.hash.replace('#', ''),
        name: localStorage.getItem('name')
      },
      //socket = io('http://votingthing.com:3883/'),
      socket = io('http://127.0.0.1:3883/'),
      newVoteNameInput = $('#new-vote-name'),
      newVoteMinInput = $('#new-vote-min'),
      newVoteMaxInput = $('#new-vote-max'),
      newVoteStepInput = $('#new-vote-step'),
      pollListArea = $('.poll-list-area');

    function myEmit (action, extraData) {
      extraData = extraData || {};
      socket.emit(action, $.extend(extraData, myData));
    }

    //<editor-fold desc="Sort out person_id">
    if (localStorage.getItem('person_id')) {
      myData.person_id = localStorage.getItem('person_id');
    } else {
      myData.person_id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { // http://stackoverflow.com/a/2117523
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem('person_id', myData.person_id);
    }
    //</editor-fold>

    $('#setup-name').val(myData.name);
    $('#setup-room').val(myData.room);

    $('#setup-form').submit(function (event) {
      event.preventDefault();
      var
        personName = $('#setup-name').val().trim(),
        roomName = $('#setup-room').val().trim();
      // Validate room name
      if (!roomName.match(/[0-9A-Za-z]/)) {
        alert('Room name must contain some letters or numbers.');
        return;
      }
      myData.name = personName;
      localStorage.setItem('name', personName);
      setRoom(roomName);
      setupDone();
      history.pushState(null, null, '#' + roomName);
      return false;
    });

    if (!myData.room && localStorage.getItem('room_name')) {
      myData.room = localStorage.getItem('room_name');
      history.pushState(null, null, '#' + myData.room);
    }

    function setRoom (roomName) {
      $('.poll-instance-area').remove(); // remove any polls from previous room
      //if (!$('.poll-type-select .ui-btn-active').length) {
      //  $('.poll-type-select li').first().addClass('ui-btn-active');
      //}
      myData.room = roomName;
      $('#room-input').val(roomName);
      localStorage.setItem('room_name', roomName);
      $('h1').text(roomName);
      myEmit('enter room', {name: myData.name});
    }

    function setupDone () {
      $('.not-setup').removeClass('not-setup').addClass('done-setup');
    }

    if (myData.room && myData.name) {
      setRoom(myData.room);
      setupDone();
    }

    $('#enter-room-form').submit(function (event) {
      event.preventDefault();
      var newRoomName = $('#room-input').val();
      // Validate room name
      if (!newRoomName.match(/[0-9A-Za-z]/)) {
        alert('Room name must contain some letters or numbers.');
        return;
      }
      $('#vt-panel').panel('close');
      if (myData.room === newRoomName) {
        return; // Already in the room.
      }
      myEmit('leave room');
      setRoom(newRoomName);
      history.pushState(null, null, '#' + newRoomName);
    });


    function Person (id, name, isMe) {
      var self = this;
      self.id = id;
      self.name = ko.observable(name);
      self.is_me = isMe;
    }

    function RoomViewModel () {
      var self = this;

      self.people = ko.observableArray([]);

      self.addPerson = function (id, name) {
        self.people.push(new Person(id, name, id === myData.person_id));
      };

      self.removePerson = function (id) {
        self.people.remove(function (item) {
          return item.id === id;
        });
      };

      self.renamePerson = function (id, name) {
        for (var i = 0; i < self.people().length; i++) {
          if (self.people()[i].id === id) {
            self.people()[i].name(name);
            return;
          }
        }
        // If we get here person was not found
        self.addPerson(id, name);
      };

      self.editName = function () {
        var newName = window.prompt('What is your name?', myData.name);
        if (!newName) {
          return;
        }
        newName = newName.trim().substring(0, 20);
        if (!newName) {
          return;
        }
        myEmit('name change', {new_name: newName});
        myData.name = newName;
        localStorage.setItem('name', newName);
      };

      self.polls = ko.observableArray([]);

      self.addPoll = function (name, ownerId, type, details, pollId, haveIVoted, ownPoll) {
        self.polls.unshift(new Poll.Poll(name, ownerId, type, details, pollId, haveIVoted, ownPoll));
      };

      self.deletePollConfirm = function (poll) {
        if (confirm('Are you sure you want to delete this poll?')) {
          myEmit('delete poll', {poll_id: poll.poll_id});
        }
      };
      socket.on('delete poll', function (poll_id) {
        self.polls.remove(function (poll) {
          return poll.poll_id === poll_id;
        });
        //pollInstanceArea.slideUp(300, function () {
        //  $(this).remove();
        //});
      });

      self.addVote = function (pollId, vote) {
        var poll = ko.utils.arrayFirst(self.polls(), function (p) {
          return p.poll_id === pollId;
        });
        poll.votes.push(vote);
      };

      //<editor-fold desc="Action: vote">
      socket.on('vote', function (data) {
        self.addVote(data.poll_id, data.vote);
      });
      self.vote = function (poll, event) {

        var
          vote,
          pollInstanceArea = $(event.currentTarget).closest('.poll');

        if (poll.type === 'range') {
          vote = pollInstanceArea.find('input[name=vote-input]').val();
          if (!$.isNumeric(vote)) {
            if (vote != '') {
              alert('Enter a number.');
            }
            return;
          }
          vote = parseFloat(vote);
        } else if (poll.type === 'item-choice') {
          vote = pollInstanceArea.find('input[name=vote-input]:checked');
          if (!vote.length) {
            alert('Select an item.');
            return;
          }
          vote = vote.val();
        } else {
          alert('Could not figure out poll type.');
          return;
        }
        myEmit('vote', {poll_id: poll.poll_id, vote: vote});
        poll.haveIVoted(true);
        pollInstanceArea.find('.vote-instance-input-area').slideUp(300, function () {
          $(this).remove();
        });
        pollInstanceArea.find('table').removeClass('not-voted').addClass('voted');
      };
      //</editor-fold>

    }

    var roomModel = new RoomViewModel();

    //roomModel.addPoll('aha', '1', 'item-choice', {items: [1, 2]}, '1', false, true);
    //roomModel.addPoll('boohoo', '1', 'range', {min: 1, max: 3, step: 0.2}, '2', false, false);

    ko.applyBindings(roomModel);

    /*
     function createPoll (poll, haveIVoted) {

     function getVoteInput (pollType, details) {
     if (pollType === 'range') {
     var targetMiddleVal = details.min + ((details.max - details.min) / 2);
     var defaultVal = details.min;
     while (defaultVal + details.step <= targetMiddleVal) {
     defaultVal += details.step;
     }
     return '<input name="vote-input" value="' + defaultVal + '" min="' + details.min + '" max="' + details.max + '" step="' + details.step + '" type="range">';
     } else if (pollType === 'item-choice') {
     var html = '<fieldset data-role="controlgroup">';
     details.items.forEach(function (i) {
     var id = Math.random(); // HACK, jquery doesn't support putting the input inside the label (at least with pre-rendered markup).
     // Pre-rendered markup so jquery doesn't have to enhance this after we add it:
     html += '<div class="ui-radio">';
     html += '<label for="' + id + '" class="ui-btn ui-btn-inherit ui-btn-icon-left ui-radio-off">' + escapeHtml(i) + '</label>';
     html += '<input name="vote-input" value="' + escapeHtml(i) + '" type="radio" id="' + id + '" data-enhanced="true">';
     html += '</div>';
     });
     html += '</fieldset>';
     $(".selector").checkboxradio("refresh");
     return html;
     }
     }

     function getResults (pollType, details, haveIVoted) {
     var html = '';
     if (pollType === 'range') {
     html += '<table class="ui-table poll-results-table ' + (haveIVoted ? 'voted' : 'not-voted') + '" data-decimals="' + details.decimals + '"><thead></thead><tbody></tbody>';
     html += '<tfoot><tr><th>Total</th><th class="results-sum num"></th></tr>';
     html += '<tr><th>Average</th><th class="results-avg num"></th></tr></tfoot>';
     html += '</table>';
     } else if (pollType === 'item-choice') {
     html += '<table class="ui-table poll-results-summary-table ' + (haveIVoted ? 'voted' : 'not-voted') + '"><tbody>';
     details.items.forEach(function (i) {
     html += '<tr><td class="results-item">' + escapeHtml(i) + '</td><td class="results-item-votes num">0</td></tr>';
     });
     html += '</tbody></table><hr>';
     html += '<table class="ui-table poll-results-table ' + (haveIVoted ? 'voted' : 'not-voted') + '"><tbody></tbody></table>';
     }
     return html;
     }

     var html = '<div data-role="collapsible" data-collapsed="false" class="poll-instance-area" data-poll-id="' + poll.poll_id + '" data-poll-type="' + poll.type + '">';
     html += '<h2>' + escapeHtml(poll.poll_name) + '</h2>';
     if (!haveIVoted) {
     html += '<div class="vote-instance-input-area">';
     html += getVoteInput(poll.type, poll.details);
     html += '<button class="vote-button" data-theme="b">Send My Vote</button>';
     html += '</div>';
     }
     html += '<div class="poll-instance-result-area">';
     html += getResults(poll.type, poll.details, haveIVoted);
     html += '</div>';
     if (poll.owner_id === myData.person_id) {
     html += '<button class="delete-poll-button" data-theme="b">Delete Poll</button>';
     }
     html += '</div>';

     if (haveIVoted) {
     $(html).prependTo(pollListArea);
     pollListArea.enhanceWithin();
     } else {
     var newVote = $(html).hide().prependTo(pollListArea);
     pollListArea.enhanceWithin();
     newVote.slideDown();
     }
     }
     */

    function addVotes (pollId, votes) {
      var
        pollInstanceArea = $('.poll-instance-area[data-poll-id=' + pollId + ']'),
        pollInstanceResultArea = pollInstanceArea.find('.poll-instance-result-area'),
        pollType = pollInstanceArea.attr('data-poll-type'),
        resultsTable = pollInstanceResultArea.find('.poll-results-table');

      pollInstanceResultArea.slideDown();

      if (pollType === 'range') {
        var decimals = resultsTable.attr('data-decimals');
        Object.keys(votes).forEach(function (person_id) {
          resultsTable.find('tbody').append('<tr><td>' + escapeHtml(votes[person_id].name) + '</td><td class="num"><span class="result-placeholder">?</span><span class="result-val">' + votes[person_id].vote.toFixed(decimals) + '</span></td></tr>');
        });
        var sum = 0;
        resultsTable.find('.result-val').each(function () {
          sum += parseFloat($(this).text());
        });
        resultsTable.find('.results-sum').text(sum.toFixed(decimals));
        resultsTable.find('.results-avg').text((sum / resultsTable.find('.result-val').length).toFixed(decimals));
      } else if (pollType === 'item-choice') {
        var
          results = {},
          resultSummaryTable = pollInstanceArea.find('.poll-results-summary-table tbody'),
          trs = resultSummaryTable.find('tr');
        trs.each(function () {
          results[$(this).find('.results-item').text()] = parseFloat($(this).find('.results-item-votes').text());
          $(this).remove();
        });
        Object.keys(votes).forEach(function (person_id) {
          results[votes[person_id].vote] += 1;
          resultsTable.find('tbody').append('<tr><td>' + escapeHtml(votes[person_id].name) + '</td><td><span class="result-placeholder">?</span><span class="result-val">' + votes[person_id].vote + '</span></td></tr>');
        });
        Object.keys(results).forEach(function (i) {
          resultSummaryTable.append('<tr><td class="results-item">' + escapeHtml(i) + '</td><td class="results-item-votes num">' + results[i] + '</td></tr>');
        });
      }
    }

    //<editor-fold desc="Sort out default new vote form values">
    (function () {
      newVoteNameInput.val(localStorage.getItem('new-vote-name') ? localStorage.getItem('new-vote-name') : 'Poll Name');
      newVoteMinInput.val(localStorage.getItem('new-vote-min') ? localStorage.getItem('new-vote-min') : 1);
      newVoteMaxInput.val(localStorage.getItem('new-vote-max') ? localStorage.getItem('new-vote-max') : 10);
      newVoteStepInput.val(localStorage.getItem('new-vote-step') ? localStorage.getItem('new-vote-step') : 1);
    }());
    //</editor-fold>

    //<editor-fold desc="Action: enter room">
    socket.on('enter room', function (people) {
      $.each(people, function (k, u) {
        roomModel.addPerson(u.person_id, u.name);
      });
    });
    //</editor-fold>

    socket.on('polls sync', function (polls) {
      polls.forEach(function (poll) {
        var haveIVoted = Object.keys(poll.votes).some(function (person_id) {
          return myData.person_id === person_id;
        });
        roomModel.addPoll(poll.poll_name, poll.owner_id, poll.type, poll.details, poll.poll_id, haveIVoted, poll.owner_id === myData.person_id);
        Object.keys(poll.votes).forEach(function (key) {
          roomModel.addVote(poll.poll_id, poll.votes[key]);
        });
      });
    });

    //<editor-fold desc="Action: name change">
    socket.on('name change', function (data) {
      roomModel.renamePerson(data.person_id, data.new_name);
    });
    //</editor-fold>

    //<editor-fold desc="Action: person left">
    socket.on('person left', function (personId) {
      roomModel.removePerson(personId);
    });
    //</editor-fold>

    //<editor-fold desc="Action: create poll">
    $('.new-poll-area').collapsible({
      // Slide up and down to prevent ghost clicks:
      collapse: function () {
        $(this).children().next().slideUp(300);
      },
      expand  : function () {
        $(this).children().next().hide();
        $(this).children().next().slideDown(300);
      }
    });
    $('#add-item-choice').on('tap', function () {
      var input = $('#new-item-choice');
      var itemText = input.val().trim();
      if (!itemText) {
        return;
      }
      var itemChoices = $('.item-choices');
      var exists = false;
      itemChoices.each(function () {
        if ($(this).text() === itemText) {
          exists = true;
        }
      });
      if (exists) {
        alert('Duplicate!');
        return;
      }
      var li = $('<li>').text(itemText);
      input.val('');
      itemChoices.append(li);
      itemChoices.listview('refresh');
    });
    $('#create-poll-button').on('tap', function () {
      var
        pollType = $('.poll-type-select .ui-state-active a').attr('data-poll-type'),
        poll, details;
      if (pollType === 'range') {
        details = {
          min : newVoteMinInput.val(),
          max : newVoteMaxInput.val(),
          step: newVoteStepInput.val()
        };
      } else if (pollType === 'item-choice') {
        var items = [];
        $('.item-choices li').each(function () {
          items.push($(this).text());
        });
        details = {
          items: items
        };
      } else {
        alert('Could not figure out poll type.');
        return;
      }
      try {
        poll = new Poll.Poll(newVoteNameInput.val(), myData.person_id, pollType, details);
      } catch (e) {
        alert(e);
        return;
      }
      myEmit('create poll', poll);
      $('.new-poll-area').collapsible('collapse');
      $('.item-choices li').remove();
    });
    socket.on('create poll', function (poll) {
      roomModel.addPoll(poll.poll_name, poll.owner_id, poll.type, poll.details, poll.poll_id, false, poll.owner_id === myData.person_id);
    });
    //</editor-fold>

    //<editor-fold desc="Action: vt_error">
    socket.on('vt_error', function (message) {
      //window.location.reload();
      //console.log(message);
      alert(message);
    });
    //</editor-fold>

  }

}());