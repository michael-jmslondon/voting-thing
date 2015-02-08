$(function () {
  'use strict';

  var
    name,
    myData = {
      room: 'bosh'//$.mobile.path.getDocumentUrl(true).filename
    },
    socket = io(),
    newVoteNameInput = $('#new-vote-name'),
    newVoteMinInput = $('#new-vote-min'),
    newVoteMaxInput = $('#new-vote-max'),
    newVoteStepInput = $('#new-vote-step'),
    voteArea = $('.vote-area'),
    roomArea = $('.roomies');

  function myEmit (action, extraData) {
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

  //<editor-fold desc="Sort out name">
  function setName () {
    var res = window.prompt("What is your name?", name);
    if (res === null && name) {
      return;
    }
    res = res.trim();
    if (!res) {
      setName();
    } else {
      name = res;
      localStorage.setItem('name', name);
      $('.my-name').text(name);
      myEmit('name change', {name: name});
    }
  }

  if (localStorage.getItem('name')) {
    name = localStorage.getItem('name');
  } else {
    setName();
  }

  $('.my-name').text(name);
  //</editor-fold>

  function addPersonToRoom (name, personId) {
    var li = $('<li>').attr('data-person-id', personId);
    if (personId === myData.person_id) {
      li.attr('data-icon', 'edit').append($('<a>').addClass('my-name').text(name)).on('tap', setName);
    } else {
      li.text(name);
    }
    roomArea.append(li);
    roomArea.listview('refresh');
  }

  // assumes type is "range" for now.
  function createPoll (poll, haveIVoted) {
    var html = '<div data-role="collapsible" data-collapsed="false" class="vote-instance-area" data-poll-id="' + poll.poll_id + '">';
    html += '<h2>' + poll.name + '</h2>';
    if (!haveIVoted) {
      html += '<div class="vote-instance-input-area">';
      html += '<input name="vote-input" value="' + (poll.details.min + ((poll.details.max - poll.details.min) / 2)) + '" min="' + poll.details.min + '" max="' + poll.details.max + '" step="' + poll.details.step + '" type="range">';
      html += '<button class="vote-button" data-theme="b">Send My Vote</button>';
      html += '</div>';
    }
    html += '<div class="vote-instance-result-area' + (haveIVoted ? '' : ' hidden') + '" data-decimals="' + poll.details.decimals + '">';
    html += '<table class="ui-table vote-results-table' + (haveIVoted ? '' : ' not-voted') + '"><thead></thead><tbody></tbody>';
    html += '<tfoot><tr><th>Total</th><th class="results-sum num"></th></tr>';
    html += '<tr><th>Average</th><th class="results-avg num"></th></tr></tfoot>';
    html += '</table>';
    html += '</div>';
    html += '</div>';
    if (haveIVoted) {
      $(html).prependTo(voteArea);
      voteArea.enhanceWithin();
    } else {
      var newVote = $(html).hide().prependTo(voteArea);
      voteArea.enhanceWithin();
      newVote.slideDown();
    }
  }

  function addVote (pollId, vote) {
    var voteInstanceResultArea = $('.vote-instance-area[data-poll-id=' + pollId + '] .vote-instance-result-area');
    var decimals = voteInstanceResultArea.attr('data-decimals');
    voteInstanceResultArea.slideDown();
    var resultsTable = voteInstanceResultArea.find('table');
    resultsTable.find('tbody').append('<tr><td>' + vote.name + '</td><td class="num result-val">' + vote.vote.toFixed(decimals) + '</td></tr>');
    var sum = 0;
    resultsTable.find('.result-val').each(function () {
      sum += parseFloat($(this).text());
    });
    resultsTable.find('.results-sum').text(sum.toFixed(decimals));
    resultsTable.find('.results-avg').text((sum / resultsTable.find('.result-val').length).toFixed(decimals));
  }

  //<editor-fold desc="Sort out default new vote form values">
  (function () {
    var val;
    if (localStorage.getItem('new-vote-name')) {
      val = localStorage.getItem('new-vote-name');
    } else {
      val = 'Poll Name';
    }
    newVoteNameInput.val(val);
    newVoteMinInput.val(localStorage.getItem('new-vote-min') ? localStorage.getItem('new-vote-min') : 5);
    newVoteMaxInput.val(localStorage.getItem('new-vote-max') ? localStorage.getItem('new-vote-max') : 15);
    newVoteStepInput.val(localStorage.getItem('new-vote-step') ? localStorage.getItem('new-vote-step') : 0.5);
  }());
  //</editor-fold>

  //<editor-fold desc="Action: enter room">
  socket.on('enter room', function (people) {
    $.each(people, function (k, u) {
      if (!$('.roomies li[data-person-id="' + u.person_id + '"]').length) {
        addPersonToRoom(u.name, u.person_id);
      }
    });
  });
  myEmit('enter room', {name: name});
  //</editor-fold>

  socket.on('polls sync', function (polls) {
    polls.forEach(function (poll) {
      var haveIVoted = Object.keys(poll.votes).some(function (person_id) {
        return myData.person_id === person_id;
      });
      createPoll(poll, haveIVoted);
      Object.keys(poll.votes).forEach(function (person_id) {
        addVote(poll.poll_id, poll.votes[person_id]);
      });
    });
  });

  //<editor-fold desc="Action: name change">
  socket.on('name change', function (data) {
    var existingUser = $('.roomies li[data-person-id="' + data.person_id + '"]');
    if (existingUser.length) {
      if (existingUser.find('a').length) {
        existingUser.find('a').text(data.name);
      } else {
        existingUser.text(data.name);
      }
    } else {
      addPersonToRoom(data.name, data.person_id);
    }
  });
  //</editor-fold>

  //<editor-fold desc="Action: person left">
  socket.on('person left', function (personId) {
    $('.roomies li[data-person-id="' + personId + '"]').remove();
  });
  //</editor-fold>

  //<editor-fold desc="Action: create poll">
  $('#create-poll-button').on('tap', function (e) {
    var poll;
    try {
      poll = new Poll.Poll(newVoteNameInput.val(), 'range', {
        min : parseFloat(newVoteMinInput.val()),
        max : parseFloat(newVoteMaxInput.val()),
        step: parseFloat(newVoteStepInput.val())
      });
    } catch (e) {
      alert(e);
      return;
    }
    myEmit('create poll', poll);
    $(".new-poll-area").collapsible("collapse");
  });
  socket.on('create poll', function (poll) {
    createPoll(poll);
  });
  //</editor-fold>

  //<editor-fold desc="Action: vote">
  socket.on('vote', function (data) {
    addVote(data.poll_id, data.vote);
  });
  voteArea.delegate('.vote-button', 'tap', function () {
    var voteInstanceArea = $(this).closest('.vote-instance-area');
    var vote = voteInstanceArea.find('input[name=vote-input]').val();
    if (!$.isNumeric(vote)) {
      if (vote != '') {
        alert('Enter a number.');
      }
      return;
    }
    myEmit('vote', {poll_id: voteInstanceArea.attr('data-poll-id'), vote: parseFloat(vote)});
    voteInstanceArea.find('.vote-instance-input-area').slideUp(400, function () {
      $(this).remove();
    });
    voteInstanceArea.find('table').removeClass('not-voted');
  });
  //</editor-fold>

  //<editor-fold desc="Action: error">
  socket.on('error', function (message) {
    console.log(message);
    alert(message);
  });
  //</editor-fold>

});
