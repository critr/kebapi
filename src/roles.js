/**
 * User roles.
 * 
 * We're implementing a simplified model, where roles are treated as a hierarchy,
 * with the next-highest role automatically having the permissions of the current role.
 * Order is lowest number = highest privilege.
 * 
 * */

// Enumerate the roles we can have
// enum
const Role = Object.freeze({
    ADMIN: 0, // Resource restricted to anyone with role of admin and above (there isn't an above).
    USER: 1, // Resource restricted to anyone with role of user and above.
    EVERYONE: 99 // Resource not restricted. Anyone can access.
});

module.exports = { Role };