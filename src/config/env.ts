import Joi from 'joi';

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().uri({ scheme: [/postgres(?:ql)?/] }).required(),
  JWT_SECRET: Joi.string().trim().min(1).default('dev-secret'),
  PORT: Joi.number().port().default(3000),
});
