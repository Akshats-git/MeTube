import mongoose, {Schema} from "mongoose";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
            index: true 
        },
        avatar: {
            type: String,  // URL to the user's avatar image
            default: null
        },
        coverImage: {
            type: String, // URL to the user's cover image
        },
        watchHistory: [
            {
                type: Schema.Types.ObjectId,
                ref: "Video"
            }
        ],
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 8 characters long"]
        },
        refreshToken: {
            type: String
        }
    },
    {
        timestamps: true  // Automatically adds createdAt and updatedAt fields
    }
)

export const User = mongoose.model("User", userSchema);
