import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFESSION_TEMPLATES } from './templates.service';

test('official profession templates cover priority segments', () => {
  const ids = PROFESSION_TEMPLATES.map((template) => template.id).sort();

  assert.deepEqual(ids, [
    'advogado',
    'comercial',
    'corretor-imoveis',
    'nutricionista',
    'salao',
  ]);
});

test('official profession templates include operational defaults', () => {
  for (const template of PROFESSION_TEMPLATES) {
    assert.ok(template.nome, `${template.id} needs a display name`);
    assert.ok(template.descricao, `${template.id} needs a description`);
    assert.ok(template.prompt_sistema?.length, `${template.id} needs an agent prompt`);
    assert.ok(template.pipeline?.length, `${template.id} needs a pipeline`);
    assert.ok(template.tags?.length, `${template.id} needs tags`);
    assert.ok(template.conhecimento?.length, `${template.id} needs starter knowledge`);
    assert.ok(template.lembrete, `${template.id} needs reminder defaults`);
    assert.ok(template.reativacao, `${template.id} needs reactivation defaults`);
  }
});
