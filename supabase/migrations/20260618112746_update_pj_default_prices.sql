-- Set permanent jewelry default prices (editable in-app via Type Estimates)
update pj_types set default_price = 60 where name = 'Bracelet';
update pj_types set default_price = 75 where name = 'Anklet';
update pj_types set default_price = 95 where name = 'Necklace';
update pj_types set default_price = 45 where name = 'Ring';
