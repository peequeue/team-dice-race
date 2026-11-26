-- Questions can be added first and answered later on the host page.
-- An unanswered question is never offered in a game.
alter table wyr_questions alter column answer drop not null;
